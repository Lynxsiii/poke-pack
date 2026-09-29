/* Browser smoke test for pack battles, at phone size.
   Start `node scripts/preview-battles.mjs` first, then:
     node scripts/test-battle-browser.mjs [webkit|chromium]
   PLAYWRIGHT_MODULE can point to an existing Playwright installation. It plays
   a quick battle against one free bot from the hall to the result. */
import assert from 'node:assert/strict';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.argv[2] || 'webkit';
const base = process.env.BATTLE_URL || 'http://127.0.0.1:5175';
const browser = await pw[engine].launch();
const page = await (await browser.newContext({ ...pw.devices['iPhone 13'] })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${base}/battles`, { waitUntil: 'load' });
const coins = async () => page.evaluate(() => document.querySelector('.coins, #coins, [data-coins]')?.textContent || '');
const quick = page.getByRole('button', { name: /^Battle (a bot|\d bots)$/ }).first();
await quick.waitFor();
await quick.click();
await page.waitForURL(/\/battles\/[a-zA-Z0-9-]+$/);
await page.locator('.tb-stage').first().waitFor();
assert.equal(await page.locator('.tb-stage').count(), 2, 'one stage per seat');
// Countdown, then the round: face-up cards land in every stage.
await page.locator('.tb-stage [data-card-id]').first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /Rematch/ }).waitFor({ timeout: 30000 });
assert.ok(await page.getByText(/takes the pot|win the pot|split/i).first().isVisible(), 'result headline');
assert.deepEqual(errors.filter((m) => !/tcgdex|access control/i.test(m)), [], 'no page errors');
console.log(`Battle browser smoke (${engine}) passed. Header coins: ${(await coins()).trim()}`);
await browser.close();
