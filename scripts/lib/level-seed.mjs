// Put a test player at a level without playing for it: writes the XP high-water
// mark (player_xp, see worker/xp.js) that the level gates and perks read.
// The suites that predate levels use this for every player so their games stay open.
import { xpForLevel } from "../../js/xp.js";

const COLUMNS = { xp2: "INTEGER", claimed2: "INTEGER", prestige: "INTEGER NOT NULL DEFAULT 0", cycle: "TEXT", original: "INTEGER NOT NULL DEFAULT 0" };

export function seedLevel(db, userId, level = 100, { prestige = 0 } = {}) {
  db.exec("CREATE TABLE IF NOT EXISTS player_xp (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, claimed_level INTEGER NOT NULL DEFAULT 1)");
  const have = new Set(db.prepare("PRAGMA table_info(player_xp)").all().map((row) => row.name));
  for (const [name, type] of Object.entries(COLUMNS)) if (!have.has(name)) db.exec(`ALTER TABLE player_xp ADD COLUMN ${name} ${type}`);
  // claimed2 set (not null) marks the row as already on the current curve.
  db.prepare(
    `INSERT INTO player_xp(user_id, xp, xp2, claimed2, prestige) VALUES(?, 0, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET xp2 = excluded.xp2, claimed2 = COALESCE(player_xp.claimed2, 1), prestige = excluded.prestige`
  ).run(userId, xpForLevel(level), prestige);
}
