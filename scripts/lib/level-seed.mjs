// Put a test player at a level without playing for it: writes the XP high-water
// mark (player_xp, see worker/xp.js) that the level gates and perks read.
// The suites that predate levels use this for every player so their games stay open.
import { xpForLevel } from "../../js/xp.js";

export function seedLevel(db, userId, level = 100) {
  db.exec("CREATE TABLE IF NOT EXISTS player_xp (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, claimed_level INTEGER NOT NULL DEFAULT 1)");
  db.prepare("INSERT INTO player_xp(user_id, xp) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp").run(userId, xpForLevel(level));
}
