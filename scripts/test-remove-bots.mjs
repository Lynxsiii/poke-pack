import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");

const migrations = readdirSync("worker/migrations").filter(name => name.endsWith(".sql")).sort();
for (const name of migrations.filter(name => name < "0009_")) {
  db.exec(readFileSync(`worker/migrations/${name}`, "utf8"));
}

const addUser = db.prepare(
  "INSERT INTO users (id, name, handle, password_hash, created_at, last_played, bot) VALUES (?, ?, ?, 'hash', 1, 1, ?)"
);
addUser.run("human", "Human", "human", 0);
addUser.run("bot", "Bot", "bot", 1);
db.prepare("INSERT INTO chat_messages (user_id, body, created_at) VALUES (?, ?, 1)").run("human", "keep this");
db.prepare("INSERT INTO chat_messages (user_id, body, created_at) VALUES (?, ?, 1)").run("bot", "remove this");
db.prepare("INSERT INTO friends (from_id, to_id, status, created_at) VALUES ('human', 'bot', 'accepted', 1)").run();
db.prepare("CREATE TABLE dms (id INTEGER PRIMARY KEY, from_id TEXT, to_id TEXT, body TEXT, created_at INTEGER)").run();
db.prepare("INSERT INTO dms (from_id, to_id, body, created_at) VALUES ('bot', 'human', 'remove this', 1)").run();
db.prepare("INSERT INTO dms (from_id, to_id, body, created_at) VALUES ('human', 'human', 'keep this', 1)").run();
db.prepare("INSERT INTO bots (user_id, handle) VALUES ('bot', 'bot')").run();

db.exec(readFileSync("worker/migrations/0009_remove_bots.sql", "utf8"));
db.exec(readFileSync("worker/migrations/0010_quests.sql", "utf8"));
db.exec(readFileSync("worker/migrations/0011_cleanup_orphan_social.sql", "utf8"));

assert.deepEqual(db.prepare("SELECT id FROM users").all().map(row => row.id), ["human"]);
assert.deepEqual(db.prepare("SELECT body FROM chat_messages").all().map(row => row.body), ["keep this"]);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM friends").get().n, 0);
assert.deepEqual(db.prepare("SELECT body FROM dms").all().map(row => row.body), ["keep this"]);
assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'bots'").get(), undefined);
assert.equal(db.prepare("SELECT name FROM pragma_table_info('users') WHERE name = 'bot'").get(), undefined);
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'quest_claims'").get());
console.log("Bot cleanup preserves human users and chat while removing bot data and schema.");
