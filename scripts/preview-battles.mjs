/** Disposable multiplayer preview. No production requests or persistent saves. */
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fallback = resolve(root, '../..');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const file of readdirSync(new URL('../worker/migrations/', import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/' + file, import.meta.url), 'utf8'));
}
const DB = {
  async exec(sql) { db.exec(sql); return {}; },
  prepare(sql) {
    let params = [];
    const stmt = {
      bind(...values) { params = values; return stmt; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first(column) { const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
      execute() { const result = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
      async run() { return stmt.execute(); },
    };
    return stmt;
  },
  async batch(statements) {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const stmt of statements) results.push(stmt.execute());
      db.exec('COMMIT');
      return results;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const now = Date.now();
for (const [id, name, color] of [['host', 'Ash Preview', 'gold'], ['rival', 'Misty Preview', 'blue'], ['third', 'Brock Preview', 'green'], ['fourth', 'Dawn Preview', 'pink']]) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, name, id + '_preview', 'unused', color, now, now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('preview-' + id, id, now, now + 86400000);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, 2500, 2500, now, '[]');
}

function assetResponse(request) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  const clean = path.replace(/^\/+/, '');
  const local = resolve(root, clean);
  if (!local.startsWith(root)) return new Response('', { status: 403 });
  const inherited = resolve(fallback, clean);
  const file = existsSync(local) ? local : inherited;
  try { return new Response(readFileSync(file), { headers: { 'content-type': mime[extname(file)] || 'application/octet-stream' } }); }
  catch { return new Response('', { status: 404 }); }
}
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const env = { DB, ASSETS: { fetch: async request => assetResponse(request) } };
const servers = [];
for (const [port, trainer] of [[5175, 'host'], [5176, 'rival'], [5177, 'third'], [5178, 'fourth']]) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:' + port);
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await worker.fetch(new Request(url, {
          method: req.method,
          headers: { ...req.headers, cookie: 'pp_sid=preview-' + trainer },
          ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
        }), env);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = /^\/(js|css|data|assets)\//.test(url.pathname) ? decodeURIComponent(url.pathname) : '/index.html';
      const local = resolve(root, pathname.replace(/^\/+/, ''));
      if (!local.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const inherited = resolve(fallback, pathname.replace(/^\/+/, ''));
      const file = existsSync(local) ? local : inherited;
      if (!existsSync(file) && pathname.startsWith('/assets/')) {
        // Missing preview assets load directly from the existing live asset URL.
        res.writeHead(302, { location: 'https://poke-pack.rip' + pathname + url.search }); res.end(); return;
      }
      const content = readFileSync(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(content);
    } catch (error) { console.error(error); res.writeHead(500); res.end('Preview request failed.'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Disposable ${trainer} preview: http://127.0.0.1:${port}/battles`));
  servers.push(server);
}
process.on('SIGINT', () => { for (const server of servers) server.close(); process.exit(); });
