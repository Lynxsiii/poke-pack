/**
 * Ambient population.
 *
 * A roster of trainer accounts that hold presence, rip packs on a human
 * cadence, and now and then say something in the lounge. They are real rows
 * in `users`, and every action goes back through handleApi() — the same path
 * a browser takes — so their coins, collections, and titles are earned the
 * way a player's are. Nothing here can mint state the API would refuse.
 *
 * They answer people. This used to be the opposite — broadcast only, never a
 * reply to a real visitor — on the reasoning that an account which answers you
 * and then cannot hold the conversation is worse than one that ignores you.
 * With worker/llm.js behind them they can hold it, and the old rule had the
 * bigger cost: someone typing into a room showing six people online and
 * getting nothing back has learned the room is fake. So bots now answer chat,
 * accept friend requests, and reply to DMs, and answering a person jumps every
 * rate limit that paces them talking among each other.
 *
 * What has not moved: they still never claim a number their public profile
 * cannot back up. That is not a politeness rule, it is the one thing a visitor
 * can actually check — packs opened, coins and the collection are all on the
 * profile. Rather than banning numbers outright, statFacts() now hands the
 * model the save's real figures and clean() drops any line using a number that
 * is not one of them.
 *
 * They also cannot do things the site cannot do. There is no trading, so a bot
 * must never agree to one; the DM brief in llm.js carries those limits, and
 * every action still goes through handleApi() so nothing here can mint state
 * the public API would refuse.
 *
 * Off entirely unless `BOT_SECRET` is bound, so dev and preview environments
 * never quietly grow a population.
 */
import { IDENTITIES, affinity } from "./personalities.js";
import { PLAYABLE_SETS, sellValue } from "../js/catalog.js";
import { isHit } from "../js/engine.js";
import { SHOWCASE_MAX } from "../js/cosmetics.js";
import {
  llmReady,
  voiceLines,
  hitLine,
  replyLine,
  dmLine,
  bioLine,
  statFacts,
  safeIdleLine,
} from "./llm.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const SESSION_MIN_MS = 45 * MINUTE;
const SESSION_MAX_MS = 100 * MINUTE;
const AWAY_MIN_MS = 10 * MINUTE;
const AWAY_MAX_MS = 45 * MINUTE;
// How long a bot waits after deciding not to come online. Short enough that
// the roster fills within an evening rather than trickling in over a day; the
// stagger that keeps them from arriving in a clump comes from AWAY_MIN/MAX
// once they have had a first session.
const RETRY_MS = 5 * MINUTE;
// First wake after signup. This used to spread over 90 minutes, which meant a
// freshly seeded roster left the lounge empty for most of an hour — exactly
// when someone turning it on is looking at it.
const FIRST_WAKE_MS = 12 * MINUTE;

const WAKE_CHANCE = 0.85;
const CHAT_CHANCE = 0.65;
const HIT_CHAT_CHANCE = 0.6;
// Rip odds scale with the balance: RIP_FLOOR once a bot can afford one pack,
// climbing RIP_PER_PACK for every further pack it could cover, capped at
// RIP_CEIL. A full hourly stack lands at the cap.
const RIP_FLOOR = 0.15;
const RIP_CEIL = 0.4;
const RIP_PER_PACK = 0.05;
const TITLE_CHANCE = 0.02;
const REACT_GAP_MS = 75 * 1000;
const REACT_WINDOW_MS = 6 * MINUTE;
// Prefer short contextual exchanges; the shared ambient cap keeps the room calm.
const REACT_CHANCE = 0.75;
const RECENT_LINES = 10;
const FRIEND_CHANCE = 0.12;

/**
 * Answering a real person is the exception to every rate limit here.
 *
 * Someone types into a room showing six people online. If nothing comes back,
 * they have learned the room is fake — and that is a worse outcome than any
 * amount of bot-to-bot noise. So a human message gets answered on sight, by
 * the first bot online that has not just spoken, ignoring the chat gap and
 * the reaction cooldown that pace the bots talking among themselves.
 */
const HUMAN_REPLY_CHANCE = 1;
const HUMAN_REPLY_WINDOW_MS = 12 * MINUTE;
// One answer per message. Without this every bot online piles onto the same
// line and the newcomer gets six replies to "hi".
const HUMAN_REPLY_GAP_MS = 15 * 1000;
const DM_CHANCE = 1;
const DM_WINDOW_MS = 24 * HOUR;
// Every message landed in the same six seconds of every minute, because that
// is when the cron fires. Real trainers post at whatever second they happen
// to hit send. Capped well under the tick interval so a slow post cannot run
// into the next invocation — cron fires once a minute and a tick posts at
// most a message or two, so the wall-clock cost stays far inside the window.
const CHAT_JITTER_MS = 2_000;
/**
 * Total jitter a tick may sleep, across every bot that speaks.
 *
 * The per-post sleep is serial — bots are walked in a loop — so it multiplies.
 * At the old chat rates two or three spoke per tick and eleven seconds each
 * was invisible. Turned up for liveliness, ten of them talking put a tick at
 * two minutes, which overruns the once-a-minute cron and starts stacking
 * invocations. Past this budget the remaining posts land unjittered; a couple
 * of messages sharing a second looks like two people typing at once, which is
 * a far smaller tell than the roster falling behind its own clock.
 */
const JITTER_BUDGET_MS = 4_000;
const LOW_COINS = 20;
const MAX_ONLINE = 12;
const MAX_NEW_PER_TICK = 3;

// ---- Written voice (worker/llm.js) ---------------------------------------
// Idle chatter is batched: one call refills a persona's pool and the next
// dozen messages come off it, so the common case costs no request at all.
const POOL_SIZE = 12;
const POOL_MIN = 3;
// Never refill more than one bot per tick. A cron invocation runs the whole
// roster in sequence, and six bots each waiting on a completion would push the
// tick towards the next one.
const MAX_REFILL_PER_TICK = 1;
const POOL_RETRY_MS = 20 * MINUTE;
// Bios are public and change rarely; a few days apart reads as someone
// editing their profile now and then rather than a feed.
const BIO_MIN_MS = 3 * 24 * HOUR;
const BIO_MAX_MS = 9 * 24 * HOUR;
const BIO_CHANCE = 0.04;
/**
 * How much of the lounge a bot reads before speaking. The per-bot recent list
 * stops one account repeating itself; this is what stops the roster as a whole
 * saying "selling doubles to fund the next one" three times in forty messages,
 * which is the repetition a reader actually notices.
 */
const GLOBAL_RECENT = 30;
/**
 * How many of the last speakers a bot checks shapes against. Has to stay well
 * under the smallest template list (HIT_LINES, 16) or every shape is excluded
 * at once and the filter falls through to its own fallback every time.
 */
const ROOM_VOICES = 8;
/**
 * Live completions per tick, across the whole roster. Each one can sit on the
 * six-second timeout, and the cron fires again in sixty — six bots each
 * waiting on a hit line would put a tick into the next one's window.
 */
const MAX_LIVE_PER_TICK = 5;
/**
 * Wall-clock a tick may spend waiting on the model, across every bot.
 *
 * The count caps above are not enough on their own: a call can take seven
 * seconds, retry, and take seven more, so nine of them could run a tick past
 * the next cron. This is the real backstop — once it passes, everything falls
 * back to written lines for the rest of the tick and the roster keeps moving.
 */
const LLM_BUDGET_MS = 20 * 1000;
/**
 * Answering people is exempt from that budget. It is the one call whose whole
 * value is that it happens now, and a tick that spends its allowance on bots
 * talking to each other and then cannot answer a visitor has it backwards.
 */
const MAX_HUMAN_CALLS_PER_TICK = 3;

/**
 * The sets bots are allowed to open. Scarlet & Violet (sv5 through sv10) is
 * left out on purpose — that data and its art are slated for a rebuild, and a
 * bot's binder and showcase are public surfaces. Widen this once those sets
 * are redone.
 */
const BOT_SETS = ["me5", "me4", "me3", "me2pt5", "me2", "me1", "zsv10pt5", "rsv10pt5"];

/**
 * Each persona keeps its own waking hours (UTC, wrapping past midnight) so the
 * online list thins out and refills over a day instead of sitting at a flat
 * count. `sets` biases what they open; `titles` are the ones they will try to
 * wear as they unlock, best first.
 */
const ROSTER = [
  { name: "Riley", handle: "rileyxo", color: "aqua", avatar: "134", banner: "drift:aqua+ocean", bio: "eeveelutions or nothing", hours: [22, 7], sets: ["me5", "me3"], titles: ["Gym Leader", "Binder rat", "Ripper"], voice: ["one day an umbreon. not today", "eeveelution or i'm not interested", "vaporeon art in this set is unreal", "i only need the one card. always the one card", "late night rips hit different", "the eeveelutions are a scam and i keep paying", "who decided sylveon should be that expensive", "staying up for one more. famous last words"] },
  { name: "Marcus", handle: "mrcs_tcg", color: "ember", avatar: "6", banner: "beam:ember+flame", bio: "opening until the charizard shows up", hours: [13, 23], sets: ["me2", "me1"], titles: ["Century", "Hit hunter", "Trainer"], voice: ["still no charizard", "every set has a charizard except the ones i open", "i will find it eventually", "charizard tax is real and i keep paying it", "opened another one. no lizard", "my whole binder is fire types and none of them are him", "this is fine. everything is fine", "one of these has to be it"] },
  { name: "Tess", handle: "tessellate", color: "violet", avatar: "150", banner: "pulse:violet+ghost", bio: "", hours: [16, 2], sets: ["me4", "me5"], titles: ["Living dex", "Collector"], voice: ["psychic types carry this game", "the pull rates are a personality test", "statistically i'm due. statistically", "numbers say keep going", "this set's curve is strange", "i keep track of these. i shouldn't", "mewtwo or bust honestly", "running the odds again like it'll change"] },
  { name: "Dez", handle: "dezzy", color: "lime", avatar: "1", banner: "mist:lime+forest", bio: "grass types deserve better", hours: [11, 20], sets: ["me1", "me3"], titles: ["Ripper", "Trainer"], voice: ["grass types deserve better", "nobody chases the starters and it shows", "bulbasaur line is criminally underrated", "give me one good grass pull", "the art on the leaf types is so clean", "still building the grass page", "green binder page or nothing", "venusaur when"] },
  { name: "Nori", handle: "norinori", color: "rose", avatar: "700", banner: "aurora:rose+fairy", bio: "sylveon collector, will trade nothing", hours: [23, 8], sets: ["me5", "me2pt5"], titles: ["Special artist", "Binder rat"], voice: ["not trading. ever. don't ask", "sylveon page is nearly full", "pink cards only, i don't make the rules", "the fairy art in this era is so good", "one more for the eeveelution page", "i will pay coins i do not have for this", "my binder is aggressively pink", "collecting is cheaper than therapy. barely"] },
  { name: "Quinn", handle: "quinnwaves", color: "ocean", avatar: "658", banner: "drift:ocean+ice", bio: "", hours: [14, 1], sets: ["me3", "me4"], titles: ["Marathon", "Century"], voice: ["water types and nothing else", "greninja pull would fix me", "this set runs cold for me", "the blues in this art are gorgeous", "rip, sell, repeat", "just vibing and opening", "ocean page filling up nicely", "frogs. that's the whole strategy"] },
  { name: "Sable", handle: "sablewing", color: "night", avatar: "197", banner: "mist:night+ghost", bio: "night shift ripper", hours: [1, 10], sets: ["me5", "me4"], titles: ["Gold chaser", "Hit hunter"], voice: ["night shift. as always", "dark types after midnight, it's a whole thing", "umbreon is the correct answer", "quiet hours are the best hours to rip", "nobody's awake so the odds are mine", "3am pack odds are better. don't fact check me", "moonlight page coming together", "one more before bed. lying obviously"] },
  { name: "Ike", handle: "ike_ttv", style: "pixel", color: "thunder", avatar: "135", banner: "beam:thunder+gold", bio: "one more pack. always one more", hours: [17, 4], sets: ["me2", "me5"], titles: ["Pull machine", "Marathon"], voice: ["one more pack. always one more", "i said i'd stop at ten. i'm at forty", "electric types or nothing", "this is genuinely a problem", "my coins evaporate instantly", "jolteon supremacy", "should be sleeping, am opening", "the hourly stack lasts me four minutes"] },
  { name: "Wren", handle: "wrenbird", color: "ice", avatar: "144", banner: "aurora:ice+aqua", bio: "", hours: [9, 18], sets: ["rsv10pt5", "me1"], titles: ["Collector", "Trainer"], voice: ["birds are underrated in this game", "articuno art is untouchable", "just here quietly opening", "cold types, cold pulls", "the blues in this set are lovely", "slow and steady binder building", "not chasing anything. just looking", "flying types get no respect"] },
  { name: "Otto", handle: "ottoman", color: "steel", avatar: "376", banner: "pulse:steel+dragon", bio: "metagross apologist", hours: [12, 21], sets: ["me3", "me2"], titles: ["Binder rat", "Ripper"], voice: ["metagross apologist, as always", "steel types are the most underrated", "give me one good metal pull", "the holo pattern on steel cards is so good", "my binder is entirely grey and i love it", "nobody chases these and that's fine by me", "steel page nearly done", "clean art beats loud art"] },
  { name: "Juno", handle: "junobean", color: "fairy", avatar: "35", banner: "aurora:fairy+rose", bio: "just here for the art", hours: [15, 0], sets: ["me4", "me2pt5"], titles: ["Illustration", "Collector"], voice: ["just here for the art honestly", "don't care about value, care about illustration", "the illustration rares carry this whole hobby", "clefairy art is criminally good", "some of these belong in a gallery", "i'd frame half these cards", "chasing art not money", "this artist did something special"] },
  { name: "Cass", handle: "cassidy_r", color: "flame", avatar: "257", banner: "beam:flame+ember", bio: "", hours: [10, 19], sets: ["me1", "me5"], titles: ["Double rare", "Trainer"], voice: ["fire types run this", "blaziken or nothing", "hot streak. relatively speaking", "that art is genuinely so good", "opening on a whim and regretting it", "red binder page is looking good", "still chasing the one", "the flame art in this set goes hard"] },
  { name: "Ravi", handle: "ravioli", color: "poison", avatar: "34", banner: "drift:poison+violet", bio: "chasing the gold", hours: [18, 5], sets: ["zsv10pt5", "me5"], titles: ["Gold chaser", "Century"], voice: ["chasing the gold", "hyper rares or nothing", "poison types are underrated", "i want the shiny gold one specifically", "gold chase continues", "one gold card. that's all i ask", "this set's gold is beautiful", "still nothing gold. still going"] },
  { name: "Bex", handle: "bexlyn", style: "pixel", color: "gold", avatar: "25", banner: "pulse:gold+thunder", bio: "", hours: [8, 17], sets: ["me2pt5", "me3"], titles: ["Hourly", "Ripper"], voice: ["hourly stack is carrying me", "pikachu will always be the one", "classic types only", "spending it the second i get it", "this is a healthy hobby", "yellow page coming along", "free coins go straight back in", "never learned to save. clearly"] },
  { name: "Milo", handle: "milohaze", color: "forest", avatar: "254", banner: "mist:forest+lime", bio: "sceptile or bust", hours: [20, 6], sets: ["me1", "me4"], titles: ["Marathon", "Ripper"], voice: ["sceptile or bust", "grass starters are the best starters", "still nothing green worth pinning", "the hoenn art in this era is great", "one good pull and i'm done for the night", "forest page is my favourite page", "chasing a card nobody else wants", "gen 3 supremacy"] },
  { name: "Sena", handle: "senaaa", color: "ghost", avatar: "94", banner: "pulse:ghost+night", bio: "gengar hoarder", hours: [21, 7], sets: ["me5", "me2"], titles: ["Ultra", "Hit hunter"], voice: ["gengar hoarder, no apologies", "ghost types after dark obviously", "spooky page is coming together", "purple cards only please", "i own too many gengars and want more", "the ghost art in this set is unreal", "not stopping until the page is full", "one more ghost. always one more"] },
  { name: "Hollis", handle: "hollisj", color: "earth", avatar: "383", banner: "beam:earth+rock", bio: "", hours: [13, 22], sets: ["rsv10pt5", "me3"], titles: ["Loaded", "Trainer"], voice: ["ground types are underrated", "groudon art is incredible", "slow build, good binder", "not chasing value, chasing the set", "earth tones page nearly full", "completion over chase, always", "master setting this one", "one card closer"] },
  { name: "Piper", handle: "piperpip", style: "pixel", color: "rock", avatar: "95", banner: "drift:rock+earth", bio: "onix enthusiast, no notes", hours: [11, 21], sets: ["me2", "me1"], titles: ["Collector", "Trainer"], voice: ["onix enthusiast, no notes", "rock types deserve more love", "nobody chases these, more for me", "the grey page is my pride", "still building slowly", "rock solid pulls today. sorry", "completing this set out of spite", "underrated types only"] },
  { name: "Ada", handle: "adawrites", color: "dragon", avatar: "149", banner: "aurora:dragon+ocean", bio: "", hours: [16, 3], sets: ["me4", "zsv10pt5"], titles: ["Banked", "Loaded"], voice: ["dragons or nothing", "dragonite art is perfect and i won't argue", "saving up for a proper run", "the dragon page is my favourite", "slowly getting there", "big pulls come to those who wait", "banking coins for once", "this set's dragons are gorgeous"] },
  { name: "Toby", handle: "tobes", style: "pixel", color: "bug", avatar: "123", banner: "mist:bug+lime", bio: "scyther supremacy", hours: [9, 19], sets: ["me3", "me1"], titles: ["Ripper", "Trainer"], voice: ["scyther supremacy", "bug types are genuinely good, fight me", "the bug art in this era is so clean", "nobody rates bugs and it's their loss", "green page slowly filling", "one good bug pull, that's all", "underrated as always", "scyther or nothing"] },
  { name: "Vic", handle: "vicvic", color: "violet", avatar: "282", banner: "pulse:violet+fairy", bio: "gardevoir. that is the whole bio", hours: [19, 5], sets: ["me5", "me2pt5"], titles: ["Illustration", "Binder rat"], voice: ["gardevoir. that is the whole bio", "psychic art is unmatched", "the illustration rares are the whole point", "chasing one card forever", "fairy psychic supremacy", "this artist understood the assignment", "my binder is one pokemon repeated", "still chasing her"] },
  { name: "Noa", handle: "noaquartz", color: "thunder", avatar: "26", banner: "beam:thunder+ember", bio: "", hours: [14, 23], sets: ["me2", "me4"], titles: ["Century", "Hit hunter"], voice: ["electric types and good art", "raichu deserves more chase cards", "steady pulls, no complaints", "the yellow page is filling up", "opening between other things", "not chasing, just collecting", "this set treats me well", "good art beats good odds"] },
  { name: "Ren", handle: "renfield", color: "night", avatar: "359", banner: "mist:night+poison", bio: "absol truther", hours: [0, 9], sets: ["me1", "me5"], titles: ["Hit hunter", "Ripper"], voice: ["absol truther", "dark types are the best designed", "nobody appreciates absol enough", "late nights and dark types", "the black border art is so good", "chasing one specific card as usual", "moody cards only", "still nothing. still going"] },
  { name: "Suki", handle: "sukisuki", style: "pixel", color: "aqua", avatar: "131", banner: "drift:aqua+ice", bio: "", hours: [12, 20], sets: ["me3", "rsv10pt5"], titles: ["Collector", "Trainer"], voice: ["water types forever", "lapras art is so calming", "just opening quietly", "blue page is my favourite", "slow collector, no rush", "not chasing anything expensive", "this set is gentle on the eyes", "one more then i'm done"] },
].map(persona => ({ ...persona, ...IDENTITIES[persona.handle] }));

/**
 * Broadcast only: nothing here addresses anyone or invites a reply.
 *
 * Nothing here asserts a fact a visitor could check either. A bot's packs
 * opened, coins, and collection are all on its public profile, so a line like
 * "finally cracked 100 packs" from an account showing nine is the thing that
 * gives the whole roster away. Anything countable goes through
 * MILESTONE_LINES, which only fire on a number the save actually holds.
 */
const IDLE_LINES = [
  "back to the mines",
  "ok one more pack then i'm done. lying",
  "three in a row with nothing. cool",
  "hourly stack is carrying me honestly",
  "the pull rates on this set are brutal",
  "why do i always get the same rare",
  "reverse holos hit different",
  "just watched my coins evaporate",
  "someone tell me to stop opening",
  "that art is genuinely so good",
  "down bad, zero hits today",
  "at least the commons look nice",
  "saving up for a proper run later",
  "chasing one card. one.",
  "my luck is unbelievable and not in a good way",
];

const SELL_LINES = [
  "dumped some dupes, back in business",
  "selling doubles to fund the next one",
  "ok that's the dupe pile gone",
];

const BROKE_LINES = [
  "and i'm broke again",
  "out of coins, waiting on the hourly",
  "zero coins. cool cool cool",
];

/** Only ever said on a number the profile actually shows. */
const MILESTONE_PACKS = [25, 50, 100, 250, 500, 1000];

const MILESTONE_LINES = [
  (n) => `${n} packs deep`,
  (n) => `just hit ${n} packs`,
  (n) => `${n} packs and still chasing`,
  (n) => `${n} packs. i should probably stop`,
  (n) => `that's ${n} packs opened. no regrets`,
  (n) => `${n} in. the binder is filling up`,
  (n) => `somehow at ${n} packs already`,
];

const HIT_LINES = [
  (name) => `${name.toLowerCase()} out of nowhere`,
  (name) => `no way. ${name.toLowerCase()}`,
  (name) => `${name.toLowerCase()} finally`,
  (name) => `ok that pack was worth it. ${name.toLowerCase()}`,
  (name) => `been chasing ${name.toLowerCase()} forever`,
  (name) => `${name.toLowerCase()}!!`,
  (name) => `got the ${name.toLowerCase()}. i can rest now`,
  (name) => `${name.toLowerCase()} on the last card of the pack`,
  (name) => `i did not expect ${name.toLowerCase()} today`,
  (name) => `${name.toLowerCase()} is going straight in the binder`,
  (name) => `okay ${name.toLowerCase()} was worth every coin`,
  (name) => `hands are shaking. ${name.toLowerCase()}`,
  (name) => `${name.toLowerCase()}. finally. after all that`,
  (name) => `well that's my week made. ${name.toLowerCase()}`,
  (name) => `pulled ${name.toLowerCase()} and immediately screamed`,
  (name) => `${name.toLowerCase()} pinned, obviously`,
];

/**
 * Worth breaking silence over. Deliberately narrower than engine.js's isHit,
 * which counts Double Rares — those land in one pack in five and nobody
 * announces them.
 */
const CHAT_WORTHY = new Set([
  "Ultra Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "Mega Hyper Rare",
  "Black White Rare",
  "Mega Attack Rare",
  "ACE SPEC Rare",
  "Shiny Ultra Rare",
]);

let schemaReady = false;

function missingSchema(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes("no such table") || msg.includes("no such column") || msg.includes("has no column");
}

async function runDdl(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch (err) {
    const msg = String(err?.message || err).toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("already exists")) throw err;
  }
}

async function ensureBotSchema(env) {
  if (schemaReady) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(users)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    if (!have.has("bot")) {
      await runDdl(env, "ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0");
    }
    await runDdl(
      env,
      `CREATE TABLE IF NOT EXISTS bots (
        user_id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, cookie TEXT,
        online_until INTEGER NOT NULL DEFAULT 0, next_wake INTEGER NOT NULL DEFAULT 0,
        last_chat_at INTEGER NOT NULL DEFAULT 0
      )`
    );
    await runDdl(env, "CREATE INDEX IF NOT EXISTS idx_users_bot ON users(bot)");
    const bots = await env.DB.prepare("PRAGMA table_info(bots)").all();
    const cols = new Set((bots.results || []).map((row) => row.name));
    // coins = -1 means "never read", which is what forces the first sync.
    if (!cols.has("coins")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN coins REAL NOT NULL DEFAULT -1");
    }
    if (!cols.has("last_daily")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_daily INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("showcase")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN showcase TEXT");
    }
    if (!cols.has("last_chat_kind")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_chat_kind TEXT");
    }
    if (!cols.has("recent_lines")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN recent_lines TEXT");
    }
    if (!cols.has("last_react_id")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_react_id INTEGER NOT NULL DEFAULT 0");
    }
    // Written lines waiting to be said, and the stamps that pace the two
    // calls that produce them. All three are inert without NVIDIA_API_KEY.
    if (!cols.has("line_pool")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN line_pool TEXT");
    }
    if (!cols.has("pool_at")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN pool_at INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("bio_at")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN bio_at INTEGER NOT NULL DEFAULT 0");
    }
    // Cached alongside coins so a tick can brief the model on what this bot
    // can honestly say without reading the whole save back.
    if (!cols.has("packs")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN packs INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("cards")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN cards INTEGER NOT NULL DEFAULT 0");
    }
    // Last chat message answered for a real person, and the last DM answered.
    if (!cols.has("last_human_id")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_human_id INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("last_dm_at")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_dm_at INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("profile_version")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("reply_depth")) await runDdl(env, "ALTER TABLE bots ADD COLUMN reply_depth INTEGER NOT NULL DEFAULT 0");
    schemaReady = true;
  } catch (err) {
    console.error("ensureBotSchema", err);
  }
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Waking hours wrap past midnight, so [22, 7] means the late crowd. */
function awake(persona, now) {
  const hour = new Date(now).getUTCHours();
  const [from, to] = persona.hours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function playableSets(persona) {
  const wanted = persona.sets.filter((id) => BOT_SETS.includes(id));
  const live = (wanted.length ? wanted : BOT_SETS).filter((id) =>
    PLAYABLE_SETS.some((set) => set.id === id)
  );
  return live.length ? live : [PLAYABLE_SETS[0].id];
}

/**
 * Bot passwords are derived, never stored. BOT_SECRET is the only thing that
 * can sign these accounts in, and rotating it orphans them by design.
 */
async function botPassword(env, handle) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(env.BOT_SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`bot:${handle}`));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Re-stamp a roster account's password after BOT_SECRET has changed.
 *
 * Without this a rotated secret strands the roster for good: the derived
 * password no longer matches, so signin 401s, signup 409s on a handle that is
 * already taken, and ensureAccounts retries the same pair every tick forever.
 * These are our own rows, so the fix is to write the new hash directly —
 * keeping the account and everything it has collected.
 *
 * The `bot = 1` guard is the whole safety of this: it must never be able to
 * overwrite a real trainer's password, so a handle collision with a human is
 * left alone and that persona simply stays offline.
 */
async function reclaim(env, helpers, persona, password) {
  if (typeof helpers?.hashPassword !== "function") return false;
  try {
    const row = await env.DB.prepare("SELECT id FROM users WHERE handle = ? AND bot = 1")
      .bind(persona.handle)
      .first();
    if (!row) return false;
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(await helpers.hashPassword(password), row.id)
      .run();
    return true;
  } catch (err) {
    if (!missingSchema(err)) console.error("bot reclaim", persona.handle, err);
    return false;
  }
}

async function signIn(env, call, persona, helpers) {
  const password = await botPassword(env, persona.handle);
  const credentials = { handle: persona.handle, password };
  let res = await call("/api/auth/signin", { method: "POST", body: credentials });

  if (res.status === 401 && (await reclaim(env, helpers, persona, password))) {
    res = await call("/api/auth/signin", { method: "POST", body: credentials });
  }

  if (res.status === 401) {
    res = await call("/api/auth/signup", {
      method: "POST",
      body: { name: persona.name, handle: persona.handle, password, color: persona.color },
    });
    if (res.cookie && res.body?.user) {
      // Flag it here rather than back in ensureAccounts: if the tick died in
      // between, the row would be unflagged and reclaim() could never rescue it.
      await env.DB.prepare("UPDATE users SET bot = 1 WHERE id = ?").bind(res.body.user.id).run();
      await call("/api/me", {
        method: "PATCH",
        cookie: res.cookie,
        body: {
          avatar: persona.avatar,
          avatarStyle: persona.style || "art",
          banner: persona.banner,
          bio: persona.bio || "",
        },
      });
    }
  }
  if (!res.cookie || !res.body?.user) return null;
  return { cookie: res.cookie, userId: res.body.user.id };
}

/**
 * Create at most a couple of accounts per tick — signup runs PBKDF2, and the
 * roster filling in over ten minutes reads better than two dozen trainers all
 * registering in the same second anyway.
 */
async function ensureAccounts(env, call, now, helpers) {
  const rows = (await env.DB.prepare("SELECT handle FROM bots").all()).results || [];
  const have = new Set(rows.map((row) => row.handle));
  const missing = ROSTER.filter((persona) => !have.has(persona.handle)).slice(0, MAX_NEW_PER_TICK);
  for (const persona of missing) {
    try {
      const next = await signIn(env, call, persona, helpers);
      if (!next) continue;
      await env.DB.prepare(
        `INSERT INTO bots (user_id, handle, cookie, online_until, next_wake, last_chat_at)
         VALUES (?, ?, ?, 0, ?, 0)
         ON CONFLICT(user_id) DO UPDATE SET cookie = excluded.cookie`
      )
        .bind(next.userId, persona.handle, next.cookie, now + rand(0, FIRST_WAKE_MS))
        .run();
    } catch (err) {
      if (!missingSchema(err)) console.error("bot signup", persona.handle, err);
    }
  }
}

async function session(env, call, row, persona, helpers) {
  if (row.cookie) return row.cookie;
  const next = await signIn(env, call, persona, helpers);
  if (!next) return null;
  await env.DB.prepare("UPDATE bots SET cookie = ?, user_id = ? WHERE handle = ?")
    .bind(next.cookie, next.userId, persona.handle)
    .run();
  row.cookie = next.cookie;
  row.user_id = next.userId;
  return next.cookie;
}

async function clearSession(env, row) {
  row.cookie = null;
  await env.DB.prepare("UPDATE bots SET cookie = NULL WHERE user_id = ?").bind(row.user_id).run();
}

/**
 * Post a line and remember it.
 *
 * `kind` is what another bot reads to decide how to answer — congratulating a
 * pull reads very differently from agreeing with a complaint. The recent list
 * is what stops a bot cycling the same four lines all evening, which is the
 * kind of pattern a regular would notice long before anything else.
 */
async function say(env, call, row, cookie, text, now, kind = "idle", tag = text, ctx = null, depth = 0) {
  if (!text) return false;
  // Claim the line before the jitter sleep, not after the post — and refuse
  // outright if the room already has it.
  //
  // This is the choke point every path goes through, which is why the check
  // lives here as well as at each generation site. Claiming afterwards left a
  // window the whole length of the jitter: two bots could each pass their own
  // staleness check, both sleep, and both post the same sentence, which is
  // exactly what happened — twice, word for word, to a newcomer's question.
  if (ctx) {
    if (kind !== "human" && (ctx.ambientMessages || 0) >= 2) return false;
    if (kind !== "human" && kind !== "react" && stale(text, ctx)) return false;
    if (kind === "react" && ctx.said.has(text.trim().toLowerCase())) return false;
    ctx.said.add(text.trim().toLowerCase());
    ctx.said.add(opening(text));
    const words = contentWords(text);
    if (words.size >= 2) ctx.recent.push(words);
    ctx.tags.add(tag);
  }

  // Spread the post across the minute instead of landing on the cron edge,
  // while the tick can still afford it.
  if (ctx) {
    const left = JITTER_BUDGET_MS - ctx.slept;
    if (left > 0) {
      const wait = rand(0, Math.min(CHAT_JITTER_MS, left));
      ctx.slept += wait;
      await sleep(wait);
    }
  } else {
    await sleep(rand(0, CHAT_JITTER_MS));
  }
  const res = await call("/api/chat", { method: "POST", cookie, body: { body: text } });
  if (res.status !== 200) return false;

  if (ctx && kind !== "human") ctx.ambientMessages = (ctx.ambientMessages || 0) + 1;
  const recent = [tag, ...readRecent(row.recent_lines)].slice(0, RECENT_LINES);
  row.last_chat_at = now;
  row.last_chat_kind = kind;
  row.recent_lines = JSON.stringify(recent);
  await env.DB.prepare(
    "UPDATE bots SET last_chat_at = ?, last_chat_kind = ?, recent_lines = ?, reply_depth = ? WHERE user_id = ?"
  )
    .bind(now, kind, row.recent_lines, depth, row.user_id)
    .run();
  return true;
}

function readRecent(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Pick a template this bot has not reached for lately.
 *
 * Hit and milestone lines interpolate a card name or a count, so the finished
 * text is almost never an exact repeat even when the shape is — which is how
 * "ok that pack was worth it" turned up twice in ten messages. Tracking the
 * template by index catches the shape, which is the part a reader notices.
 */
function pickTemplate(list, row, prefix, used = EMPTY_SET) {
  const tagged = list.map((make, i) => ({ tag: `${prefix}#${i}`, make }));
  const recent = new Set(readRecent(row.recent_lines));
  // A shape is what carries across accounts: "salazzle finally" and "exeggutor
  // finally" are different strings, so the room's text check never sees them
  // as a repeat, while a reader clocks the third one immediately.
  const fresh = tagged.filter((item) => !recent.has(item.tag) && !used.has(item.tag));
  if (fresh.length) return pick(fresh);
  const mine = tagged.filter((item) => !recent.has(item.tag));
  return pick(mine.length ? mine : tagged);
}

/**
 * Prefer something neither this bot nor the room has said lately; fall back
 * once the pool runs dry.
 *
 * `taken` is what the lounge is already showing. Without it the per-bot list
 * only stops an account repeating *itself*, and twenty-four accounts drawing
 * from the same sixteen templates still land the same line three times a page
 * — which is exactly how the roster read before.
 */
const EMPTY_SET = new Set();

function pickFresh(pool, row, taken = EMPTY_SET) {
  const list = Array.isArray(pool) && pool.length ? pool : IDLE_LINES;
  const recent = new Set(readRecent(row.recent_lines));
  const unsaid = list.filter(
    (line) => !recent.has(line) && !taken.has(line.toLowerCase()) && !taken.has(opening(line))
  );
  if (unsaid.length) return pick(unsaid);
  // Room-wide collision only: still better to avoid the room than the pool.
  const mine = list.filter((line) => !recent.has(line));
  return pick(mine.length ? mine : list);
}

/**
 * The first few words, normalised.
 *
 * Exact-string matching missed the way a model actually repeats itself: three
 * bots answered the same question with "fake coins, spend real time though",
 * "fake coins, real bad pulls" and "fake coins, real time wasted". Different
 * strings, obviously the same line. Comparing openings catches those.
 */
function opening(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

/** Words worth comparing — the ones that carry what a line is about. */
const FILLER = new Set([
  "the","a","an","and","or","but","so","is","it","its","im","i","you","your","my",
  "me","to","of","in","on","at","for","with","just","some","any","all","this",
  "that","then","than","get","got","from","not","no","yes","up","out","if","as",
  "be","are","was","will","would","do","does","did","have","has","too","very",
  "still","again","one","like","about","though","honestly","actually","really",
]);

function contentWords(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !FILLER.has(w))
  );
}

/**
 * Is this line saying what something in the room already said?
 *
 * Openings alone were not enough. A newcomer asking how to start got four
 * answers — "just open packs, coins come from dupes", "open packs, hoard
 * coins, repeat", "open packs, dupes turn into coins" — which share almost
 * every meaningful word and none of the first three. The model mirrors what
 * it sees in context, so the check has to be about content, not word order.
 *
 * Half the significant words in common is the threshold: high enough that two
 * bots can both mention charizard, low enough to catch a paraphrase.
 */
function tooSimilar(text, ctx) {
  if (!ctx?.recent?.length) return false;
  const words = contentWords(text);
  if (words.size < 2) return false;
  for (const prior of ctx.recent) {
    let shared = 0;
    for (const word of words) if (prior.has(word)) shared += 1;
    if (shared / Math.min(words.size, prior.size) >= 0.5) return true;
  }
  return false;
}

/** Everything a bot checks a candidate line against before saying it. */
function stale(text, ctx) {
  return ctx.said.has(String(text).trim().toLowerCase()) ||
    ctx.said.has(opening(text)) ||
    tooSimilar(text, ctx);
}

/** What the lounge is currently showing, lowercased for comparison. */
function roomRecent(chat) {
  if (!Array.isArray(chat)) return EMPTY_SET;
  const out = new Set();
  for (const msg of chat.slice(-GLOBAL_RECENT)) {
    const body = typeof msg?.body === "string" ? msg.body.trim().toLowerCase() : "";
    if (!body) continue;
    out.add(body);
    out.add(opening(body));
  }
  return out;
}

/** The word sets tooSimilar() compares against, from what the room shows. */
function roomWords(chat) {
  if (!Array.isArray(chat)) return [];
  return chat
    .slice(-GLOBAL_RECENT)
    .map((msg) => contentWords(msg?.body))
    .filter((set) => set.size >= 2);
}

function readPool(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x) : [];
  } catch {
    return [];
  }
}

async function savePool(env, row, list) {
  row.line_pool = JSON.stringify(list);
  await env.DB.prepare("UPDATE bots SET line_pool = ? WHERE user_id = ?")
    .bind(row.line_pool, row.user_id)
    .run();
}

/**
 * Claim one of the tick's live completions, or refuse.
 *
 * Everything that calls the model on the hot path goes through here, so the
 * worst case for a tick is MAX_LIVE_PER_TICK timeouts rather than one per
 * bot online. A refusal is not an error — the caller falls back to a written
 * line, which is what it would have said before any of this existed.
 */
function claimCall(env, ctx) {
  if (!llmReady(env)) return false;
  if (Date.now() > ctx.deadline) return false;
  if (ctx.calls >= MAX_LIVE_PER_TICK) return false;
  ctx.calls += 1;
  return true;
}

/**
 * The same claim for a message aimed at a person. Kept separate so bots
 * chattering among themselves can never eat the allowance that answers a
 * visitor — it has its own count, and only the wall-clock budget is shared.
 */
function claimHumanCall(env, ctx) {
  if (!llmReady(env)) return false;
  if (Date.now() > ctx.deadline) return false;
  if (ctx.humanCalls >= MAX_HUMAN_CALLS_PER_TICK) return false;
  ctx.humanCalls += 1;
  return true;
}

/**
 * Top a persona's pool back up from the model.
 *
 * `ctx.refills` caps this to one bot per tick — see MAX_REFILL_PER_TICK. The
 * stamp moves whether or not the call succeeded, so a dead key costs one
 * request every twenty minutes rather than one per bot per minute.
 */
async function refillPool(env, row, persona, now, ctx, taken) {
  if (ctx.refills >= MAX_REFILL_PER_TICK) return [];
  if (now - Number(row.pool_at || 0) < POOL_RETRY_MS) return [];
  if (!claimCall(env, ctx)) return [];

  ctx.refills += 1;
  row.pool_at = now;
  await env.DB.prepare("UPDATE bots SET pool_at = ? WHERE user_id = ?").bind(now, row.user_id).run();

  const avoid = [...readRecent(row.recent_lines), ...taken];
  const lines = await voiceLines(env, persona, { count: POOL_SIZE, avoid, facts: factsFor(row) });
  if (!lines.length) return [];
  await savePool(env, row, lines);
  return lines;
}

/**
 * The next thing this bot says when nothing in particular has happened.
 *
 * Written lines come off the pool first and are consumed as they are used, so
 * a line is never said twice by the account that generated it. An empty pool
 * with no key behind it drops silently through to the persona's own voice.
 */
async function idleLine(env, row, persona, now, ctx, taken) {
  let pool = readPool(row.line_pool);
  if (pool.length < POOL_MIN) {
    const fresh = await refillPool(env, row, persona, now, ctx, taken);
    if (fresh.length) pool = fresh;
  }
  const usable = pool.filter((line) => safeIdleLine(line) && !stale(line, ctx));
  if (usable.length) {
    const line = pick(usable);
    await savePool(env, row, pool.filter((item) => item !== line));
    return line;
  }
  return null; // No recycled catchphrases when generation is unavailable.
}

/**
 * Rewrite the bio now and then.
 *
 * Goes through PATCH /api/me like everything else, so it is subject to the
 * same 160-character trim a person's bio is. A refusal or a failed generation
 * leaves the seeded bio in place, which is why every persona still ships one.
 */
async function refreshBio(env, call, row, persona, cookie, now, ctx) {
  const due = Number(row.bio_at || 0);
  if (due && now < due) return false;
  if (!claimCall(env, ctx)) return false;

  // Stamp first: a model that keeps refusing this persona should not be asked
  // again on the next tick.
  row.bio_at = now + rand(BIO_MIN_MS, BIO_MAX_MS);
  await env.DB.prepare("UPDATE bots SET bio_at = ? WHERE user_id = ?")
    .bind(row.bio_at, row.user_id)
    .run();

  const bio = await bioLine(env, persona);
  if (!bio) return false;
  const res = await call("/api/me", { method: "PATCH", cookie, body: { bio } });
  return res.status === 200;
}

/**
 * Every bot talking on the same clock is a tell, so the gap is spread 14-34
 * minutes by handle — stable per persona, different between them.
 */
function chatGapFor(persona) {
  let h = 0;
  for (const ch of persona.handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (3 + (h % 5)) * MINUTE;
}

/**
 * Bots befriend bots.
 *
 * Twenty-four accounts on a social site with nothing connecting them is its
 * own tell: every profile reading "0 friends" says nobody here knows anyone.
 *
 * Incoming requests are accepted from anyone now, real people included —
 * that is what opens the DM route, since the API is friends-only. Outgoing
 * requests stay roster-only: a bot cold-adding a stranger is a different and
 * much odder thing than one accepting.
 */
async function mingle(env, call, row, persona, cookie, { reachOut = false } = {}) {
  const list = await call("/api/friends", { cookie });
  if (list.status !== 200) return false;
  const onRoster = (u) => ROSTER.some((item) => item.handle === u?.handle);

  // People first — someone waiting on an accept is waiting on a person.
  const incoming = list.body?.incoming || [];
  const waiting = incoming.filter((u) => !onRoster(u)).concat(incoming.filter(onRoster));
  if (waiting.length) {
    await call("/api/friends/respond", {
      method: "POST",
      cookie,
      body: { handle: waiting[0].handle, accept: true },
    });
    return true;
  }

  // Accepting is checked every tick because someone is waiting on it. Sending
  // is not: on every tick a bot would fire a request at the whole roster
  // within the hour, and the requests are the cheap half of nothing.
  if (!reachOut) return false;

  const known = new Set([
    persona.handle,
    ...(list.body?.friends || []).map((u) => u.handle),
    ...(list.body?.outgoing || []).map((u) => u.handle),
  ]);
  const strangers = ROSTER.filter((item) => !known.has(item.handle));
  if (!strangers.length) return false;
  await call("/api/friends/request", {
    method: "POST",
    cookie,
    body: { handle: pick(strangers).handle },
  });
  return true;
}

/**
 * Answer a real person in the lounge.
 *
 * Tried before anything else a bot might do, and past every gap that paces
 * the roster talking to itself. The whole point of the population is that
 * someone who says something gets an answer.
 *
 * One bot per message: `ctx.answered` claims the message id for the tick and
 * `last_human_id` holds it across ticks, so a newcomer saying "hi" gets one
 * reply and not six. Handled entirely by whoever is already online — nobody
 * wakes up to answer, because an account that appears the instant you speak
 * and says something is stranger than silence.
 */
async function answerHuman(env, call, row, persona, cookie, chat, now, ctx) {
  if (!llmReady(env)) return false;
  if (!Array.isArray(chat) || !chat.length) return false;
  if (ctx.humanCalls >= MAX_HUMAN_CALLS_PER_TICK || Date.now() > ctx.deadline) return false;
  if (now - Number(row.last_chat_at || 0) < HUMAN_REPLY_GAP_MS) return false;

  // Newest first: answer what was just said, not the backlog.
  const handles = new Set(ROSTER.map((item) => item.handle));
  const target = [...chat]
    .reverse()
    .find(
      (msg) =>
        msg?.user?.handle &&
        !handles.has(msg.user.handle) &&
        now - Number(msg.at || 0) <= HUMAN_REPLY_WINDOW_MS &&
        Number(msg.id) > Math.max(Number(row.last_human_id || 0), ctx.lastHumanId || 0) &&
        !ctx.answered.has(Number(msg.id))
    );
  if (!target) return false;
  // A named regular gets their own question. Include nearby messages so a
  // correction such as "ada, sorry" does not erase the original question.
  const conversation = chat.filter(msg => now - Number(msg.at || 0) <= HUMAN_REPLY_WINDOW_MS);
  const visitorLines = conversation.filter(msg => msg.user?.handle === target.user.handle).slice(-4);
  const named = [...visitorLines].reverse().map(msg => ROSTER.find(bot =>
    new RegExp(`\\b${bot.name}\\b`, "i").test(String(msg.body || "")))).find(Boolean);
  if (named && named.handle !== persona.handle) return false;
  if (Math.random() > HUMAN_REPLY_CHANCE) return false;

  ctx.answered.add(Number(target.id));
  if (!claimHumanCall(env, ctx)) {
    ctx.answered.delete(Number(target.id));
    return false;
  }
  // Stamped on every row, not just this one. `last_human_id` is the roster's
  // high-water mark rather than each bot's own — held per bot, every account
  // answers the same message once on its own next tick, and one question gets
  // six replies spread over five minutes.
  const id = Number(target.id) || 0;

  const line = await replyLine(env, persona, target.user.name || "someone", String(target.body || ""), {
    avoid: [...readRecent(row.recent_lines), ...ctx.said],
    facts: factsFor(row),
    human: true,
    context: conversation.slice(-12).map(msg => ({ speaker: msg.user?.name || msg.user?.handle || "visitor", body: String(msg.body || "") })),
  });
  // No fallback on purpose. The written pools are all "same" and "lol", and
  // answering a person with those is worse than letting another bot take it
  // on the next tick. A line that opens like something already on screen is
  // dropped for the same reason.
  if (!line) {
    ctx.answered.delete(Number(target.id));
    return false;
  }
  if (!(await say(env, call, row, cookie, line, now, "human", line, ctx))) {
    ctx.answered.delete(id);
    return false;
  }
  // Only acknowledge a message after the reply was actually posted. Keep
  // the in-memory roster in sync with the database high-water mark too.
  ctx.lastHumanId = id;
  await env.DB.prepare("UPDATE bots SET last_human_id = ? WHERE last_human_id < ?")
    .bind(id, id)
    .run();
  row.last_human_id = id;
  return true;
}

/**
 * Answer the last thing another bot said.
 *
 * Visitor messages are handled first by answerHuman(); this continues a
 * short conversation between collectors using the same contextual reply style.
 */
async function react(env, call, row, persona, cookie, chat, now, ctx) {
  const last = Array.isArray(chat) && chat.length ? chat[chat.length - 1] : null;
  if (!last?.user?.handle) return false;

  const speaker = ROSTER.find((item) => item.handle === last.user.handle);
  if (!speaker || speaker.handle === persona.handle) return false;
  if (Number(last.id) === Number(row.last_react_id || 0)) return false;
  if (now - Number(last.at || 0) > REACT_WINDOW_MS) return false;
  if (now - Number(row.last_chat_at || 0) < REACT_GAP_MS) return false;
  if (Math.random() > REACT_CHANCE) return false;

  const theirs = await env.DB.prepare("SELECT last_chat_kind, reply_depth FROM bots WHERE handle = ?")
    .bind(speaker.handle)
    .first();
  const kind = theirs?.last_chat_kind || "idle";

  // Allow two replies, then leave room for a new topic or a visitor.
  if (kind === "human" || Number(theirs?.reply_depth || 0) >= 2) return false;
  if (ctx.reacted?.has(Number(last.id))) return false;

  if (!claimCall(env, ctx)) return false;
  const written = await replyLine(env, persona, speaker.name, String(last.body || ""), {
    avoid: [...readRecent(row.recent_lines), ...ctx.said], facts: factsFor(row),
    context: chat.slice(-8).map(msg => ({speaker:msg.user?.name || "visitor", body:String(msg.body || "")})),
  });
  if (!written) return false;
  const posted = await say(env, call, row, cookie, written, now, "react", written, ctx, Number(theirs?.reply_depth || 0) + 1);
  if (!posted) return false;
  (ctx.reacted ||= new Set()).add(Number(last.id));
  await env.DB.prepare("UPDATE bots SET last_react_id = ? WHERE user_id = ?").bind(Number(last.id),row.user_id).run();
  row.last_react_id = Number(last.id);
  return true;
}

/**
 * Answer a DM.
 *
 * Friends-only at the API, so this only ever fires for someone who sent a
 * request and had it accepted. The thread goes to the model with the limits
 * in llm.js attached — no trading, no claims about anyone's account.
 */
async function answerDm(env, call, row, persona, cookie, now, ctx) {
  if (!llmReady(env)) return false;
  if (ctx.humanCalls >= MAX_HUMAN_CALLS_PER_TICK || Date.now() > ctx.deadline) return false;
  if (now - Number(row.last_dm_at || 0) < HUMAN_REPLY_GAP_MS) return false;

  const list = await call("/api/dms", { cookie });
  if (list.status !== 200) return false;
  const handles = new Set(ROSTER.map((item) => item.handle));
  const waiting = (list.body?.threads || []).filter(
    (thread) =>
      thread?.last &&
      thread.last.mine === false &&
      !handles.has(thread.user?.handle) &&
      now - Number(thread.last.at || 0) <= DM_WINDOW_MS
  );
  if (!waiting.length) return false;
  if (Math.random() > DM_CHANCE) return false;

  const thread = pick(waiting);
  const full = await call(`/api/dms/${encodeURIComponent(thread.user.handle)}`, { cookie });
  if (full.status !== 200 || !Array.isArray(full.body?.messages)) return false;

  if (!claimHumanCall(env, ctx)) return false;
  row.last_dm_at = now;
  await env.DB.prepare("UPDATE bots SET last_dm_at = ? WHERE user_id = ?")
    .bind(now, row.user_id)
    .run();

  const line = await dmLine(env, persona, thread.user.name || "them", full.body.messages, {
    facts: factsFor(row),
  });
  if (!line) return false;
  await sleep(rand(0, CHAT_JITTER_MS));
  const sent = await call("/api/dms", {
    method: "POST",
    cookie,
    body: { handle: thread.user.handle, body: line },
  });
  return sent.status === 200;
}

/**
 * Cache the balance and the hourly stamp on the bots row.
 *
 * /api/me returns the whole save, which means reading every card the bot owns
 * — cheap on a new account, hundreds of rows once it has collected for a week.
 * Every response that already carries a save updates this instead, so a tick
 * decides what to do from a row it has in hand.
 */
async function remember(env, row, save) {
  const coins = Number(save?.coins);
  row.coins = Number.isFinite(coins) ? coins : -1;
  row.last_daily = save?.lastDaily == null ? 0 : Number(save.lastDaily);
  row.packs = Math.max(0, Math.floor(Number(save?.packsOpened) || 0));
  row.cards = save?.collection
    ? Object.values(save.collection).reduce((sum, n) => sum + (Number(n) || 0), 0)
    : Number(row.cards) || 0;
  await env.DB.prepare(
    "UPDATE bots SET coins = ?, last_daily = ?, packs = ?, cards = ? WHERE user_id = ?"
  )
    .bind(row.coins, row.last_daily, row.packs, row.cards, row.user_id)
    .run();
}

/**
 * The numbers this bot is allowed to quote, off the cached row.
 *
 * statFacts() wants a save; the row is what a tick has in hand, so this is the
 * same shape assembled from the three columns remember() keeps current. A
 * pack-rip response refreshes them, so they are never more than one action
 * stale — close enough that anything the model says still matches the profile
 * a visitor would open.
 */
function factsFor(row) {
  return statFacts({
    packsOpened: Number(row.packs) || 0,
    coins: Number(row.coins) > 0 ? Number(row.coins) : 0,
    collection: null,
    ...(Number(row.cards) > 0 ? { collection: { _: Number(row.cards) } } : {}),
  });
}

/**
 * A player who logs in to an hourly stack spends it. Odds climb with how many
 * packs the balance actually covers, so a bot fresh off the bonus opens most
 * minutes and one down to its last coins slows to a trickle. Held flat, a bot
 * earned 100 coins an hour and opened about six packs with it, and the balance
 * — public on its profile, next to a packs-opened count that stayed low — grew
 * into a number no real trainer would sit on.
 *
 * The catalog cost is close enough to pace against; the worker prices the pack
 * off sealed.json when it actually charges for it.
 */
function ripChance(coins, cost) {
  if (!(cost > 0) || coins < cost) return 0;
  return Math.min(RIP_CEIL, RIP_FLOOR + (coins / cost) * RIP_PER_PACK);
}

function costOf(setId) {
  const set = PLAYABLE_SETS.find((item) => item.id === setId);
  return Number(set?.cost) || 0;
}

function readShowcase(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((slot) => slot && slot.id) : [];
  } catch {
    return [];
  }
}

const slotKey = (list) => list.map((s) => `${s.id}:${s.reverse ? 1 : 0}`).join(",");

/**
 * Put the best pulls on the profile.
 *
 * A player who lands a chase card sets it as their showcase; a bot whose six
 * slots stay empty while its binder fills is showing you exactly what it is.
 * Ranked by sell value rather than rarity, so the slots hold what is actually
 * worth something — a Double Rare worth pennies never displaces an
 * illustration rare.
 *
 * The cached copy is what keeps this cheap: it only PATCHes when a pull
 * genuinely beats what is already up, which after the first few packs is rare.
 */
// Load only public card metadata; reused across identity migrations in an isolate.
let identityCatalog;
async function syncIdentity(env, call, row, persona, cookie, ctx) {
  if ((Number(row.profile_version) >= 2 && Number(row.bio_at || 0) > Date.now()) || (ctx.profileUpdates || 0) >= 6) return;
  ctx.profileUpdates = (ctx.profileUpdates || 0) + 1;
  if (!identityCatalog) {
    const cards = [];
    for (const id of BOT_SETS) {
      const res = await env.ASSETS.fetch(new Request(`https://assets.local/data/${id}.json`));
      if (!res.ok) throw new Error(`Identity catalog unavailable: ${id}`);
      cards.push(...await res.json());
    }
    identityCatalog = new Map(cards.map(card => [card.id, card]));
  }
  const mine = await call("/api/me", { cookie });
  if (mine.status !== 200 || !mine.body?.save) return;
  const collection = mine.body.save.collection || {};
  const cards = Object.keys(collection).filter(id => collection[id] > 0)
    .map(id => identityCatalog.get(id)).filter(Boolean);
  // Rebuild from cards actually owned, including beloved commons.
  const themed = cards.filter(card => affinity(persona, card) > 0);
  const next = themed.map(card => ({ id: card.id, reverse: Number(mine.body.save.reverses?.[card.id] || 0) >= Number(collection[card.id]),
    affinity: affinity(persona, card), value: Number(sellValue(card)) || 0 }))
    .sort((a,b) => b.affinity - a.affinity || b.value - a.value).slice(0, SHOWCASE_MAX);
  const pageCards = themed.sort((a,b) => affinity(persona,b) - affinity(persona,a) || (Number(sellValue(b)) || 0) - (Number(sellValue(a)) || 0)).slice(0,36);
  const binder = Array.from({length: Math.max(18,Math.ceil(pageCards.length/9)*9)}, (_,i) => pageCards[i] ? {
    id:pageCards[i].id, reverse:Number(mine.body.save.reverses?.[pageCards[i].id] || 0) >= Number(collection[pageCards[i].id]),
  } : null);
  const saved = await call("/api/binder", {method:"PUT",cookie,body:{binder}});
  if (saved.status !== 200) return;
  const binderPages = Array.from({length:Math.ceil(pageCards.length/9)},(_,i)=>i);
  const res = await call("/api/me", { method: "PATCH", cookie, body: {
    binderPages, bio: persona.bio, avatar: persona.avatar, avatarStyle: persona.style || "art",
    color: persona.color, banner: persona.banner,
    showcase: next.map(({id, reverse}) => ({id, reverse})),
  }});
  if (res.status !== 200) return;
  row.showcase = JSON.stringify(next);
  row.profile_version = 2;
  row.bio_at = Date.now() + 6 * HOUR;
  // Discard the old generic idle pool when the collecting identity changes.
  row.line_pool = null;
  row.pool_at = 0;
  await env.DB.prepare("UPDATE bots SET profile_version = 2, showcase = ?, bio_at = ?, line_pool = NULL, pool_at = 0 WHERE user_id = ?")
    .bind(row.showcase, row.bio_at, row.user_id).run();
}

async function showcaseBest(env, call, row, cookie, cards, persona) {
  const held = readShowcase(row.showcase);
  const merged = held.slice();

  for (const card of cards) {
    if (!affinity(persona, card)) continue;
    if (merged.some((slot) => slot.id === card.id)) continue;
    merged.push({ id: card.id, reverse: Boolean(card.reverse), value: Number(sellValue(card)) || 0, affinity: affinity(persona, card) });
  }
  if (merged.length === held.length) return;

  merged.sort((a, b) => (b.affinity || 0) - (a.affinity || 0) || (Number(b.value) || 0) - (Number(a.value) || 0));
  const next = merged.slice(0, SHOWCASE_MAX);
  if (slotKey(next) === slotKey(held)) return;

  const res = await call("/api/me", {
    method: "PATCH",
    cookie,
    body: { showcase: next.map((slot) => ({ id: slot.id, reverse: slot.reverse })) },
  });
  if (res.status !== 200) return;

  row.showcase = JSON.stringify(next);
  await env.DB.prepare("UPDATE bots SET showcase = ? WHERE user_id = ?")
    .bind(row.showcase, row.user_id)
    .run();
}

/**
 * Sell a double if the coins ran low, otherwise open a pack — what a player
 * does with the same balance, and what keeps a bot solvent between hourly
 * stacks. Anything said here is said because it just happened.
 */
async function openOrSell(env, call, row, persona, cookie, setId, quiet, now, ctx) {
  if (Number(row.coins) < LOW_COINS) {
    // The collection is only pulled on this branch, which is rare — it is the
    // one decision the cached balance alone cannot answer.
    const mine = await call("/api/me", { cookie });
    const collection = mine.body?.save?.collection || {};
    const dupes = Object.keys(collection).filter((id) => collection[id] > 1);
    if (mine.body?.save) await remember(env, row, mine.body.save);
    if (dupes.length) {
      const sold = await call("/api/cards/sell", {
        method: "POST",
        cookie,
        body: { cardId: pick(dupes) },
      });
      if (sold.body?.save) await remember(env, row, sold.body.save);
      if (sold.status === 200 && quiet && Math.random() < CHAT_CHANCE) {
        const line = pickFresh(SELL_LINES, row, ctx.said);
        await say(env, call, row, cookie, line, now, "sell", line, ctx);
      }
      return;
    }
  }

  // More presence should not multiply pack writes beyond the daily D1 budget.
  if ((ctx.rips || 0) >= 1) return;
  ctx.rips = (ctx.rips || 0) + 1;
  const ripped = await call("/api/packs/rip", { method: "POST", cookie, body: { setId } });

  if (ripped.status !== 200) {
    // Refused, so the cached balance was optimistic. Zero it so the next tick
    // goes looking for doubles to sell instead of asking again.
    row.coins = 0;
    await env.DB.prepare("UPDATE bots SET coins = 0 WHERE user_id = ?").bind(row.user_id).run();
    if (quiet && Math.random() < CHAT_CHANCE) {
      const line = pickFresh(BROKE_LINES, row, ctx.said);
      await say(env, call, row, cookie, line, now, "broke", line, ctx);
    }
    return;
  }

  await remember(env, row, ripped.body?.save);
  await showcaseBest(env, call, row, cookie, ripped.body?.cards || [], persona);

  const packs = Number(ripped.body?.save?.packsOpened || 0);
  if (quiet && MILESTONE_PACKS.includes(packs)) {
    const shape = pickTemplate(MILESTONE_LINES, row, "milestone", ctx.tags);
    await say(env, call, row, cookie, shape.make(packs), now, "milestone", shape.tag, ctx);
    return;
  }

  const hit = (ripped.body?.cards || []).find(
    (card) => !card.reverse && CHAT_WORTHY.has(card.rarity)
  );
  if (hit && quiet && Math.random() < HIT_CHAT_CHANCE) {
    // Worth a live call: this is the only message with a real subject, and the
    // written templates are the ones a reader catches first precisely because
    // they repeat a shape around a swapped-in card name.
    const written = claimCall(env, ctx)
      ? await hitLine(env, persona, hit, {
          avoid: [...readRecent(row.recent_lines), ...ctx.said],
          facts: factsFor(row),
        })
      : null;
    if (written) {
      await say(env, call, row, cookie, written, now, "hit", written, ctx);
      return;
    }
    const shape = pickTemplate(HIT_LINES, row, "hit", ctx.tags);
    await say(env, call, row, cookie, shape.make(hit.name), now, "hit", shape.tag, ctx);
  }
}

/**
 * One thing per minute at most. Reading the lounge is what marks a bot online
 * in the first place — everything after it is optional.
 */
async function act(env, call, row, persona, now, ctx, helpers) {
  const cookie = await session(env, call, row, persona, helpers);
  if (!cookie) return;

  const seen = await call("/api/lounge", { cookie });
  if (seen.status === 401) {
    await clearSession(env, row);
    return;
  }

  const quiet = now - Number(row.last_chat_at || 0) >= chatGapFor(persona);
  // Fold what this bot can see into the tick-wide set every picker reads, so
  // nothing said here repeats what is already on screen or what another bot
  // has queued up this pass.
  for (const line of roomRecent(seen.body?.chat)) ctx.said.add(line);
  if (!ctx.recent.length) ctx.recent = roomWords(seen.body?.chat);

  // A person waiting on an answer outranks everything else this bot could be
  // doing with its minute, including opening a pack.
  if (ctx.priorityOnly && await answerHuman(env, call, row, persona, cookie, seen.body?.chat, now, ctx)) return;
  // A pending friend request is also someone waiting, and it is what unlocks
  // DMs, so it goes above the roster's own business too.
  if (ctx.priorityOnly && ctx.humanCalls < MAX_HUMAN_CALLS_PER_TICK && (await answerDm(env, call, row, persona, cookie, now, ctx)))
    return;
  // Answering another bot depends on a message still being recent, so it
  // comes before the things that can happen on any tick.
  if (ctx.priorityOnly) return;
  await syncIdentity(env, call, row, persona, cookie, ctx);
  if (await mingle(env, call, row, persona, cookie)) return;
  if (await react(env, call, row, persona, cookie, seen.body?.chat, now, ctx)) return;

  if (Number(row.coins) < 0) {
    const mine = await call("/api/me", { cookie });
    if (mine.status === 401) {
      await clearSession(env, row);
      return;
    }
    if (!mine.body?.save) return;
    await remember(env, row, mine.body.save);
  }

  if (now - Number(row.last_daily || 0) >= HOUR) {
    const paid = await call("/api/daily", { method: "POST", cookie });
    if (paid.body?.save) {
      await remember(env, row, paid.body.save);
    } else {
      // Refused, so the stamp we hold has drifted. Resync once rather than ask
      // again every tick for the rest of the hour.
      const mine = await call("/api/me", { cookie });
      if (mine.body?.save) await remember(env, row, mine.body.save);
    }
    return;
  }

  const setId = pick(playableSets(persona));
  const broke = Number(row.coins) >= 0 && Number(row.coins) < LOW_COINS;
  if ((ctx.rips || 0) < 1 && (Math.random() < ripChance(Number(row.coins), costOf(setId)) || (broke && Math.random() < 0.25))) {
    await openOrSell(env, call, row, persona, cookie, setId, quiet, now, ctx);
    return;
  }

  if (quiet && Math.random() < CHAT_CHANCE) {
    const line = await idleLine(env, row, persona, now, ctx, ctx.said);
    await say(env, call, row, cookie, line, now, "idle", line, ctx);
    return;
  }
  if (!persona.favorite && Math.random() < BIO_CHANCE && (await refreshBio(env, call, row, persona, cookie, now, ctx)))
    return;
  // Accepts are checked every tick rather than on the FRIEND_CHANCE roll: a
  // real person's request sitting unanswered for hours is what this is here
  // to fix. Only the outgoing half stays on the dice.
  if (await mingle(env, call, row, persona, cookie, { reachOut: Math.random() < FRIEND_CHANCE }))
    return;
  if (Math.random() < TITLE_CHANCE) {
    // The API rejects a locked title, so walking the list best-first and
    // ignoring the 400 lands them on whatever they have actually earned.
    for (const title of persona.titles) {
      const res = await call("/api/me", { method: "PATCH", cookie, body: { title } });
      if (res.status === 200) break;
    }
  }
}

async function step(env, call, row, persona, now, ctx, helpers) {
  if (Number(row.online_until) > now) {
    await act(env, call, row, persona, now, ctx, helpers);
    return;
  }
  if (Number(row.next_wake) > now && ctx.online >= 6) return;

  if (ctx.online >= MAX_ONLINE || (ctx.online >= 6 && (!awake(persona, now) || Math.random() > WAKE_CHANCE))) {
    await env.DB.prepare("UPDATE bots SET next_wake = ? WHERE user_id = ?")
      .bind(now + rand(RETRY_MS, RETRY_MS * 3), row.user_id)
      .run();
    return;
  }

  ctx.online += 1;
  const until = now + rand(SESSION_MIN_MS, SESSION_MAX_MS);
  await env.DB.prepare("UPDATE bots SET online_until = ?, next_wake = ? WHERE user_id = ?")
    .bind(until, until + rand(AWAY_MIN_MS, AWAY_MAX_MS), row.user_id)
    .run();
  row.online_until = until;
  await act(env, call, row, persona, now, ctx, helpers);
}

/**
 * Called once a minute by the scheduled handler. `call` is the in-process API
 * caller from worker/index.js, so a tick costs no outbound requests.
 */
export async function tickBots(env, call, helpers = {}) {
  if (!env.BOT_SECRET) return;
  await ensureBotSchema(env);
  const now = Date.now();

  try {
    await ensureAccounts(env, call, now, helpers);
    const rows = (await env.DB.prepare("SELECT * FROM bots").all()).results || [];
    // Tick-wide state. `said` and `tags` are what keep the roster from
    // converging: every bot reads them before it picks and writes to them
    // after it posts, so a line or a template shape used anywhere on the
    // roster is off the table for everyone else until it ages out.
    const ctx = {
      online: rows.filter((row) => Number(row.online_until) > now).length,
      refills: 0,
      calls: 0,
      humanCalls: 0,
      said: new Set(),
      tags: new Set(),
      // Chat message ids already answered this tick, so one person's message
      // gets one reply rather than one from every bot online.
      answered: new Set(),
      // Content-word sets for tooSimilar(), seeded from the lounge on the
      // first bot's turn and appended to as the tick posts.
      recent: [],
      // Jitter spent so far this tick — see JITTER_BUDGET_MS.
      slept: 0,
      // Past this, no more model calls this tick — see LLM_BUDGET_MS.
      deadline: now + LLM_BUDGET_MS,
    };
    // Only the last thing each of the most recent speakers said. Seeding from
    // every row's full history instead saturates: twenty-four bots holding ten
    // entries each covers all sixteen hit shapes, `fresh` comes back empty on
    // every pick, and the filter quietly stops filtering.
    for (const row of [...rows]
      .sort((a, b) => Number(b.last_chat_at || 0) - Number(a.last_chat_at || 0))
      .slice(0, ROOM_VOICES)) {
      const last = readRecent(row.recent_lines)[0];
      if (last) ctx.tags.add(last);
    }
    for (const priorityOnly of [true, false]) {
      ctx.priorityOnly = priorityOnly;
      const ordered = [...rows].sort((a, b) => Number(a.last_chat_at || 0) - Number(b.last_chat_at || 0));
      for (const row of ordered) {
        const persona = ROSTER.find((item) => item.handle === row.handle);
        if (!persona) continue;
        try {
          if (priorityOnly) await step(env, call, row, persona, now, ctx, helpers);
          else if (Number(row.online_until) > now) await act(env, call, row, persona, now, ctx, helpers);
          else if ((Number(row.profile_version) < 2 || Number(row.bio_at || 0) <= now) && (ctx.profileUpdates || 0) < 6) {
            const cookie = await session(env, call, row, persona, helpers);
            if (cookie) await syncIdentity(env, call, row, persona, cookie, ctx);
          }
        } catch (err) {
          console.error("bot step", row.handle, err);
        }
      }
    }
  } catch (err) {
    console.error("tickBots", err);
  }
}
