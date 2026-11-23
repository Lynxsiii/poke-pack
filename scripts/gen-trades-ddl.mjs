/* Writes worker/migrations/0035_trades.sql from worker/trades-ddl.js (the one
   source of the trading schema; the Worker applies the same statements itself).
   Run after changing the DDL: node scripts/gen-trades-ddl.mjs
   `--check` only compares and exits 1 when the file is stale. */
import { readFileSync, writeFileSync } from "node:fs";
import { TRADES_DDL } from "../worker/trades-ddl.js";

const file = new URL("../worker/migrations/0035_trades.sql", import.meta.url);
export const tradesMigrationSql = () =>
  `-- Player-to-player trading. Generated from worker/trades-ddl.js by scripts/gen-trades-ddl.mjs
-- (read that file for what each table and trigger does). worker/trades.js applies
-- the same statements on demand, so a deploy never needs this run by hand;
-- running it later replays harmlessly. Purely additive.
${TRADES_DDL.map((sql) => `${sql};`).join("\n\n")}
`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const next = tradesMigrationSql();
  if (process.argv.includes("--check")) {
    let have = "";
    try { have = readFileSync(file, "utf8"); } catch { /* missing */ }
    if (have !== next) { console.error("worker/migrations/0035_trades.sql is stale: run node scripts/gen-trades-ddl.mjs"); process.exit(1); }
    console.log("0035_trades.sql is current");
  } else {
    writeFileSync(file, next);
    console.log("wrote worker/migrations/0035_trades.sql");
  }
}
