/** Automated browser regression against disposable, in-memory preview accounts. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const hostURL = 'http://127.0.0.1:5175';
let preview;
let browser;
let activePage;
try {
  if (!process.env.BATTLE_PREVIEW_ALREADY_RUNNING) {
    preview = spawn(process.execPath, ['scripts/preview-battles.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    preview.stderr.on('data', bytes => process.stderr.write(bytes));
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(hostURL + '/api/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Disposable preview did not start.');
  }
  const browserName = process.env.BATTLE_BROWSER || 'webkit';
  browser = await (browserName === 'chromium' ? chromium : webkit).launch({ headless: true,
    ...(browserName === 'chromium' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  const externalMetadataErrors = [];
  const collectError = error => {
    // Existing card-metadata requests can hit localhost CORS restrictions in WebKit.
    if (/api\.tcgdex\.net\/.*due to access control checks\./.test(error.message)) externalMetadataErrors.push(error.message);
    else errors.push(error.message);
  };
  page.on('pageerror', collectError);
  const capture = async name => {
    if (!process.env.BATTLE_CAPTURE_DIR) return;
    await mkdir(process.env.BATTLE_CAPTURE_DIR, { recursive: true });
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('#view-battles img'));
      images.forEach(img => { img.loading = 'eager'; });
      await Promise.race([Promise.all(images.map(img => img.decode().catch(() => {}))),
        new Promise(resolve => setTimeout(resolve, 4000))]);
    });
    await page.screenshot({ path: `${process.env.BATTLE_CAPTURE_DIR}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${process.env.BATTLE_CAPTURE_DIR}/${name}-viewport.png` });
    if (name === 'builder-mobile') {
      await page.locator('#battle-settings-heading').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.BATTLE_CAPTURE_DIR}/${name}-settings-viewport.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  };
  await page.goto(hostURL + '/battles');
  await page.locator('#view-battles [data-battle-action="builder"]').first().waitFor();
  await capture('lobby-desktop');
  await page.locator('#view-battles [data-battle-action="builder"]').first().click();
  await page.getByRole('heading', { name: 'Build your battle', exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Search products' }).fill('Pitch Black booster pack');
  await page.locator('[data-battle-add="me5:boosterPack"]').click();
  await page.getByRole('searchbox', { name: 'Search products' }).fill('Booster Bundle');
  await page.locator('[data-battle-add="me5:boosterBundle"]').click();
  assert.equal(await page.locator('#battle-round-count').textContent(), '7 rounds');
  await page.locator('[data-battle-setting="players"][data-value="3"]').click();
  await page.locator('[data-battle-setting="mode"][data-value="crazy"]').click();
  await page.locator('#battle-scoring').selectOption('last');
  await page.locator('[data-battle-toggle="fast"]').check();
  await page.locator('[data-battle-toggle="skipCommons"]').check();
  await capture('builder-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('builder-mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-battle-action="create"]').click();
  await page.waitForURL(/\/battles\/[a-f0-9]{8}-[a-f0-9-]{27}$/i);
  const id = new URL(page.url()).pathname.split('/')[2];
  const rival = await context.newPage();
  activePage = rival;
  rival.on('pageerror', collectError);
  await rival.goto('http://127.0.0.1:5176/battles/' + id);
  await rival.locator('[data-battle-action="join"][data-seat="1"]').waitFor();
  await rival.locator('[data-battle-action="join"][data-seat="1"]').click();
  await rival.locator('[data-battle-action="leave"]').waitFor();
  await page.reload();
  await page.locator('[data-battle-action="bot"][data-seat="2"]').waitFor();
  await page.locator('[data-battle-action="bot"][data-seat="2"]').click();
  await page.locator('[data-battle-action="start"]:not([disabled])').waitFor();
  await page.locator('[data-battle-action="start"]').click();
  await capture('arena-desktop');
  const running = await fetch(hostURL + '/api/battles/' + id).then(r => r.json());
  assert.equal(running.battle.status, 'running');
  assert.equal(running.battle.rounds.length, 0, 'Future card pulls must remain private.');
  assert.deepEqual(running.battle.settings, { players: 3, teams: false, mode: 'crazy', scoring: 'last', fast: true, skipCommons: true, private: false });
  await page.getByRole('heading', { name: 'Where the cards landed', exact: true }).waitFor({ timeout: 35000 });
  const finished = await fetch(hostURL + '/api/battles/' + id).then(r => r.json());
  assert.equal(finished.battle.rounds.length, 7);
  assert.equal(finished.battle.seats.filter(seat => seat.bot).length, 1);
  assert.equal(finished.battle.seats.filter(seat => !seat.bot).length, 2);
  assert.ok(finished.battle.rounds.flatMap(round => round.pulls).some(pull => pull.cards.some(card => card.rarity === 'Common')));
  await capture('results-desktop');
  await rival.getByRole('heading', { name: 'Where the cards landed', exact: true }).waitFor({ timeout: 10000 });
  await page.reload();
  await page.getByRole('heading', { name: 'Where the cards landed', exact: true }).waitFor();
  await page.locator('[data-battle-action="replay"]').click();
  await page.locator('[data-battle-action="replay"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'Battle arena must fit a 390px viewport.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('heading', { name: 'Where the cards landed', exact: true }).waitFor();
  await capture('results-mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-battle-action="rematch"]').click();
  await page.getByRole('heading', { name: 'Build your battle', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, [], 'No uncaught browser errors.');
  if (externalMetadataErrors.length) console.log(`Existing external card-metadata CORS warnings on localhost: ${externalMetadataErrors.length}.`);
  console.log(`${browserName} battle checks passed: mixed products, settings, real-player join, sponsored bot, concealed future pulls, synchronized settlement, refresh, replay, reduced motion and 390px layout.`);
} catch (error) {
  console.error('Browser check failed at', activePage?.url());
  if (activePage) console.error((await activePage.locator('body').innerText()).slice(0, 4500));
  throw error;
} finally {
  await browser?.close();
  preview?.kill();
}
