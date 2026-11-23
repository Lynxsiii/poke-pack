/* A disposable local copy of the site for the trading pages: the real Worker on
   in-memory SQLite, with a few signed-in trainers who own cards and slabs.
   node scripts/preview-trades.mjs [port]   then open http://127.0.0.1:5176/trades
   Each browser picks its trainer with a cookie: pp_sid=ann, bob, cat (a stranger) or low (level 2).
   With no cookie the server signs you in as ann. Memory only: nothing here touches the live site. */
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { sellValue } from '../js/catalog.js';
import { createTestDb, seedPlayer } from './lib/d1-test-db.mjs';
import { seedLevel } from './lib/level-seed.mjs';

const port = Number(process.argv[2]) || 5176;
const { db, env } = createTestDb();
env.SITE_ORIGIN = `http://127.0.0.1:${port}`;
const now = Date.now();
const cardsOf = (setId) => { const raw = JSON.parse(readFileSync(new URL(`../data/${setId}.json`, import.meta.url), 'utf8')); return raw.cards || raw; };
const byValue = (setId) => cardsOf(setId).filter((c) => c.image).sort((a, b) => sellValue(b) - sellValue(a));
const give = (user, id, qty = 1, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, id, qty, rev);
let seq = 0;
const slab = (user, id, grade, bl = 0) => db.prepare(`INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,guard,status,created_at,shown,locked,black_label)
  VALUES(?,?,0,?,'modern',0,?,NULL,'slabbed',?,0,NULL,?)`).run(user, id, grade, `seed-${++seq}`, now, bl);

for (const [id, name, level, coins] of [['ann', 'Ann', 24, 1250.5], ['bob', 'Bob', 12, 310], ['cat', 'Cat', 31, 5200], ['low', 'Rookie', 2, 25]]) {
  seedPlayer(db, { id, coins, session: id });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(now + 30 * 86400000, id);
  seedLevel(db, id, level);
}
for (const [a, b] of [['ann', 'bob'], ['bob', 'ann']]) db.prepare("INSERT INTO friends(from_id,to_id,status,created_at) VALUES(?,?,'accepted',?)").run(a, b, now);

const me1 = byValue('me1'); const me5 = byValue('me5'); const sv = byValue('sv8');
// Ann: a spread of Mega Evolution, some duplicates, a few reverse holos, two slabs.
me1.slice(0, 6).forEach((c) => give('ann', c.id));
me1.slice(12, 60).forEach((c, i) => give('ann', c.id, 1 + (i % 4), i % 3 === 0 ? 1 : 0));
me1.slice(120, 160).forEach((c, i) => give('ann', c.id, 2 + (i % 5), 1));
slab('ann', me1[2].id, 10); slab('ann', me1[9].id, 9); slab('ann', me5[1].id, 10, 1);
// Bob: another set, so the two have things the other lacks.
me5.slice(0, 5).forEach((c) => give('bob', c.id));
me5.slice(8, 50).forEach((c, i) => give('bob', c.id, 1 + (i % 3), i % 4 === 0 ? 1 : 0));
sv.slice(0, 12).forEach((c) => give('bob', c.id));
slab('bob', me5[0].id, 10); slab('bob', sv[3].id, 8);
// Cat: a stranger with a small pile.
sv.slice(4, 30).forEach((c, i) => give('cat', c.id, 1 + (i % 2)));
me1.slice(6, 12).forEach((c) => give('cat', c.id));

const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, env.SITE_ORIGIN);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const cookie = /pp_sid=/.test(req.headers.cookie || '') ? req.headers.cookie : 'pp_sid=ann';
      const result = await worker.fetch(new Request(url, { method: req.method, headers: { ...req.headers, cookie },
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) }), env);
      const headers = Object.fromEntries(result.headers); delete headers['set-cookie'];
      res.writeHead(result.status, headers); res.end(Buffer.from(await result.arrayBuffer())); return;
    }
    let path = /^\/(?:js|css|data|assets)\//.test(url.pathname) ? url.pathname : '/index.html';
    if (/^\/assets\/cards\/.+-sm\.webp$/.test(path)) path = path.replace(/-sm\.webp$/, '.webp');
    const content = readFileSync(new URL('..' + decodeURIComponent(path), import.meta.url));
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(content);
  } catch (err) { res.writeHead(err?.code === 'ENOENT' ? 404 : 500); res.end(String(err?.message || err)); }
}).listen(port, '127.0.0.1', () => console.log(`Trading preview: http://127.0.0.1:${port}/trades (memory only). Trainers: ann, bob (friends), cat, low.`));
