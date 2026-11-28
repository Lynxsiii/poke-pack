// Render the coin lab (scripts/coin-lab.html) at phone size, one screenshot per pose.
//   node scripts/coin-lab.mjs --out dir [--browser webkit] [--query "finish=foil&n=12"] [--poses plain,rest,tl,br] [--name x]
// Needs a static server on the repo root: python3 -m http.server 8799
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg("--out", "."), engine = arg("--browser", "chromium"), query = arg("--query", ""), name = arg("--name", "coins");
const POSES = { rest: "", tl: "&nx=-0.7&ny=-0.6", br: "&nx=0.8&ny=0.5", r: "&nx=0.9&ny=0", plain: "&nomap=1" };
const b = await (engine === "webkit" ? webkit : chromium).launch();
const page = await b.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: Number(arg("--scale", 2)) });
for (const pose of arg("--poses", "plain,rest,tl,br").split(",")) {
  await page.goto(`http://localhost:${arg("--port", 8799)}/scripts/coin-lab.html?${query}${POSES[pose] ?? ""}`);
  await page.waitForSelector("body[data-ready]");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-${pose}-${engine}.png`, fullPage: true });
}
await b.close();
