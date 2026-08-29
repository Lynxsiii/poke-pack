/**
 * Ambient population.
 *
 * A roster of trainer accounts that hold presence, rip packs on a human
 * cadence, and now and then say something in the lounge. They are real rows
 * in `users`, and every action goes back through handleApi() — the same path
 * a browser takes — so their coins, collections, and titles are earned the
 * way a player's are. Nothing here can mint state the API would refuse.
 *
 * Each persona is a different player, not a different name over the same
 * player: it hunts one specific Pokémon line, opens the sets that line is
 * actually printed in, spends or banks its coins to its own temper, and
 * answers the room in its own register. Otto is after Metagross, so he opens
 * Ascended Heroes and Perfect Order, keeps every Beldum he pulls, and leads
 * his showcase with the best one.
 *
 * They talk to each other and to nobody else. A bot only ever answers a
 * handle on this roster — an account that cannot hold up its end of a
 * conversation is a person being told they made a friend.
 *
 * Off entirely unless `BOT_SECRET` is bound, so dev and preview environments
 * never quietly grow a population.
 */
import { PLAYABLE_SETS, RARITY_LABEL, sellValue } from "../js/catalog.js";
import { isHit } from "../js/engine.js";
import { SHOWCASE_MAX } from "../js/cosmetics.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const SESSION_MIN_MS = 8 * MINUTE;
const SESSION_MAX_MS = 52 * MINUTE;
const AWAY_MIN_MS = 40 * MINUTE;
const AWAY_MAX_MS = 7 * HOUR;
// How long a bot waits after deciding not to come online. Short enough that
// the roster fills within an evening rather than trickling in over a day; the
// stagger that keeps them from arriving in a clump comes from AWAY_MIN/MAX
// once they have had a first session.
const RETRY_MS = 5 * MINUTE;
// First wake after signup. This used to spread over 90 minutes, which meant a
// freshly seeded roster left the lounge empty for most of an hour — exactly
// when someone turning it on is looking at it.
const FIRST_WAKE_MS = 12 * MINUTE;

const WAKE_CHANCE = 0.35;
const CHAT_CHANCE = 0.12;
const HIT_CHAT_CHANCE = 0.4;
// The card they are actually here for. A player who lands their white whale
// says so, so this is near-certain rather than a coin flip.
const CHASE_CHAT_CHANCE = 0.95;
// Their favourite rarity, which is a smaller thing than the chase itself.
const GRAIL_CHAT_CHANCE = 0.55;
const TITLE_CHANCE = 0.02;
const REACT_GAP_MS = 8 * MINUTE;
const REACT_WINDOW_MS = 5 * MINUTE;
// Reactions are garnish. Left high they crowd out everything a persona
// actually has to say, and the lounge turns into "same" / "real" / "agreed".
const REACT_CHANCE = 0.22;
// Worth answering unprompted; anything else needs the second roll below.
const REACT_EAGER = new Set(["hit", "chase", "grail", "milestone"]);
// Hearing your own chase named is not garnish.
const CHASE_REACT_CHANCE = 0.85;
// Kinds that mean a card was actually pulled, rather than talked about.
const PULL_KINDS = new Set(["hit", "chase", "grail"]);
// How far back a bot will look for something worth answering.
const REACT_SCAN = 6;
const RECENT_LINES = 12;
const MAX_ONLINE = 6;
const MAX_NEW_PER_TICK = 2;
// How often a bot reaches for the set its chase is printed in rather than the
// other set it likes. Not 1, because a player who only ever opens one set for
// weeks is its own kind of tell.
const CHASE_SET_BIAS = 0.72;
// Showcase slots held for the chase, so a collector's profile leads with the
// thing it collects instead of whatever happened to book highest.
const CHASE_SLOTS = 2;
const CHASE_IDS_MAX = 60;

/**
 * The sets bots are allowed to open. Scarlet & Violet (sv5 through sv10) is
 * left out on purpose — that data and its art are slated for a rebuild, and a
 * bot's binder and showcase are public surfaces. Widen this once those sets
 * are redone.
 */
const BOT_SETS = ["me5", "me4", "me3", "me2pt5", "me2", "me1", "zsv10pt5", "rsv10pt5"];

/**
 * How a persona treats its coins, which is the difference a visitor can see
 * without reading a word of chat: a spender's profile is a big packs-opened
 * count next to nothing in the bank, a saver's is the reverse.
 *
 * `hold` is how many packs' worth it keeps banked before it will open another,
 * `sellAt` the balance at which it goes looking for doubles to dump, and
 * floor/ceil/per shape the same odds curve ripChance() has always used.
 */
const TEMPERS = {
  spender: { floor: 0.3, ceil: 0.9, per: 0.08, hold: 0, sellAt: 22 },
  steady: { floor: 0.15, ceil: 0.75, per: 0.05, hold: 0.5, sellAt: 20 },
  saver: { floor: 0.1, ceil: 0.5, per: 0.03, hold: 4, sellAt: 14 },
  // Funds the chase off the dupe pile: sells long before it is actually broke.
  flipper: { floor: 0.2, ceil: 0.8, per: 0.06, hold: 0, sellAt: 45 },
};

/**
 * Each persona keeps its own waking hours (UTC, wrapping past midnight) so the
 * online list thins out and refills over a day instead of sitting at a flat
 * count.
 *
 * `chase` is the line it hunts: `match` are lowercase fragments tested against
 * a pulled card's name, and `sets` are the sets that line is actually printed
 * in — checked against data/, so nobody is hunting a card that cannot drop.
 * `sets` biases what they open, `grail` is the rarity they most want to see,
 * `mood` picks which register they answer the room in, `temper` indexes
 * TEMPERS, `chatty` scales how often they speak, `stamina` how long they stay,
 * and `titles` are the ones they will try to wear as they unlock, best first.
 */
const ROSTER = [
  {
    name: "Riley", handle: "rileyxo", color: "aqua", avatar: "730",
    banner: "drift:aqua+ocean", bio: "water starters and late nights",
    hours: [22, 7], sets: ["me5", "me3"], titles: ["Gym Leader", "Binder rat", "Ripper"],
    mood: "warm", temper: "steady", chatty: 1.2, stamina: 1.1, grail: "Illustration Rare",
    chase: { name: "Primarina", match: ["popplio", "brionne", "primarina"], sets: ["me5"] },
    voice: [
      "late night rips hit different",
      "water types and good art, that's the whole hobby",
      "the blues in this set are unreal",
      "staying up for one more. famous last words",
      "my binder is aggressively blue",
      "the sea page is coming together",
      "who decided the good ones should be the rare ones",
      "singing whale seal thing. that's my type",
    ],
  },
  {
    name: "Marcus", handle: "mrcs_tcg", color: "ember", avatar: "6",
    banner: "beam:ember+flame", bio: "opening until the charizard shows up",
    hours: [13, 23], sets: ["me2pt5", "me2"], titles: ["Century", "Hit hunter", "Trainer"],
    mood: "salty", temper: "spender", chatty: 1.3, stamina: 1, grail: "Mega Hyper Rare",
    chase: { name: "Charizard", match: ["charizard", "charmander", "charmeleon"], sets: ["me2pt5", "me2"] },
    voice: [
      "every set has a charizard except the ones i open",
      "charizard tax is real and i keep paying it",
      "my whole binder is fire types and none of them are him",
      "this is fine. everything is fine",
      "one of these has to be it",
      "opened another one. no lizard",
      "the fire page is full of nearly",
      "i will find it eventually",
    ],
  },
  {
    name: "Tess", handle: "tessellate", color: "violet", avatar: "150",
    banner: "pulse:violet+ghost", bio: "",
    hours: [16, 2], sets: ["me2pt5", "me4"], titles: ["Living dex", "Collector"],
    mood: "dry", temper: "steady", chatty: 0.9, stamina: 1, grail: "Special Illustration Rare",
    chase: { name: "Mewtwo", match: ["mewtwo"], sets: ["me2pt5"] },
    voice: [
      "psychic types carry this game",
      "the pull rates are a personality test",
      "statistically i'm due. statistically",
      "the numbers say keep going",
      "this set's curve is strange",
      "i keep track of these. i shouldn't",
      "running the odds again like it'll change",
      "the maths is not on my side and i respect that",
    ],
  },
  {
    name: "Dez", handle: "dezzy", color: "lime", avatar: "1",
    banner: "mist:lime+forest", bio: "grass types deserve better",
    hours: [11, 20], sets: ["me1", "me3"], titles: ["Loaded", "Ripper", "Trainer"],
    mood: "warm", temper: "saver", chatty: 1, stamina: 0.9, grail: "Illustration Rare",
    chase: { name: "Venusaur", match: ["bulbasaur", "ivysaur", "venusaur"], sets: ["me1"] },
    voice: [
      "grass types deserve better",
      "nobody chases the starters and it shows",
      "the art on the leaf types is so clean",
      "still building the grass page",
      "green binder page or nothing",
      "saving up properly this time",
      "gen 1 grass is the best grass",
      "i'd rather bank it than waste it on a bad night",
    ],
  },
  {
    name: "Nori", handle: "norinori", color: "rose", avatar: "36",
    banner: "aurora:rose+fairy", bio: "clefable collector, will trade nothing",
    hours: [23, 8], sets: ["me3", "me2pt5"], titles: ["Special artist", "Banked", "Binder rat"],
    mood: "warm", temper: "saver", chatty: 0.8, stamina: 1, grail: "Special Illustration Rare",
    chase: { name: "Clefable", match: ["clefairy", "clefable"], sets: ["me3", "me2pt5"] },
    voice: [
      "not trading. ever. don't ask",
      "pink cards only, i don't make the rules",
      "the fairy art in this era is so good",
      "i will pay coins i do not have for this",
      "my binder is aggressively pink",
      "collecting is cheaper than therapy. barely",
      "saving for the one that matters",
      "the fairy page is nearly full",
    ],
  },
  {
    name: "Quinn", handle: "quinnwaves", color: "ocean", avatar: "658",
    banner: "drift:ocean+ice", bio: "",
    hours: [14, 1], sets: ["me4", "me3"], titles: ["Marathon", "Century"],
    mood: "calm", temper: "steady", chatty: 0.9, stamina: 1.4, grail: "Ultra Rare",
    chase: { name: "Greninja", match: ["froakie", "frogadier", "greninja"], sets: ["me4"] },
    voice: [
      "water types and nothing else",
      "this set runs cold for me",
      "the blues in this art are gorgeous",
      "rip, sell, repeat",
      "just vibing and opening",
      "the ocean page is filling up nicely",
      "frogs. that's the whole strategy",
      "long session, no complaints",
    ],
  },
  {
    name: "Sable", handle: "sablewing", color: "night", avatar: "491",
    banner: "mist:night+ghost", bio: "night shift ripper",
    hours: [1, 10], sets: ["me5", "me4"], titles: ["Gold chaser", "Hit hunter"],
    mood: "dry", temper: "spender", chatty: 0.8, stamina: 1.2, grail: "Mega Hyper Rare",
    chase: { name: "Darkrai", match: ["darkrai"], sets: ["me5"] },
    voice: [
      "night shift. as always",
      "dark types after midnight, it's a whole thing",
      "quiet hours are the best hours to rip",
      "nobody's awake so the odds are mine",
      "3am pack odds are better. don't fact check me",
      "the moonlight page is coming together",
      "one more before bed. lying obviously",
      "black bordered art is the best art",
    ],
  },
  {
    name: "Ike", handle: "ike_ttv", color: "thunder", avatar: "807",
    banner: "beam:thunder+gold", bio: "one more pack. always one more",
    hours: [17, 4], sets: ["me5", "me2pt5"], titles: ["Pull machine", "Marathon"],
    mood: "hyped", temper: "spender", chatty: 1.6, stamina: 1.5, grail: "Ultra Rare",
    chase: { name: "Zeraora", match: ["zeraora"], sets: ["me5"] },
    voice: [
      "one more pack. always one more",
      "i said i'd stop at ten. i'm well past ten",
      "electric types or nothing",
      "this is genuinely a problem",
      "my coins evaporate instantly",
      "should be sleeping, am opening",
      "the hourly stack lasts me four minutes",
      "we go again",
    ],
  },
  {
    name: "Wren", handle: "wrenbird", color: "ice", avatar: "581",
    banner: "aurora:ice+aqua", bio: "",
    hours: [9, 18], sets: ["rsv10pt5", "zsv10pt5"], titles: ["Collector", "Loaded", "Trainer"],
    mood: "calm", temper: "saver", chatty: 0.7, stamina: 0.9, grail: "Illustration Rare",
    chase: { name: "Swanna", match: ["ducklett", "swanna"], sets: ["rsv10pt5"] },
    voice: [
      "birds are underrated in this game",
      "just here quietly opening",
      "cold types, cold pulls",
      "slow and steady binder building",
      "not chasing anything loud. just looking",
      "flying types get no respect",
      "unova art is quietly the best art",
      "i'd rather wait and open properly",
    ],
  },
  {
    name: "Otto", handle: "ottoman", color: "steel", avatar: "376",
    banner: "pulse:steel+dragon", bio: "metagross apologist",
    hours: [12, 21], sets: ["me4", "me2pt5"], titles: ["Binder rat", "Ripper"],
    mood: "dry", temper: "steady", chatty: 0.9, stamina: 1, grail: "Special Illustration Rare",
    chase: { name: "Metagross", match: ["beldum", "metang", "metagross"], sets: ["me4", "me2pt5"] },
    voice: [
      "metagross apologist, as always",
      "steel types are the most underrated",
      "the holo pattern on steel cards is so good",
      "my binder is entirely grey and i love it",
      "nobody chases these and that's fine by me",
      "the steel page is nearly done",
      "clean art beats loud art",
      "beldum, metang, then the good one. in that order",
    ],
  },
  {
    name: "Juno", handle: "junobean", color: "fairy", avatar: "716",
    banner: "aurora:fairy+rose", bio: "just here for the art",
    hours: [15, 0], sets: ["me4", "me2pt5"], titles: ["Illustration", "Collector"],
    mood: "warm", temper: "saver", chatty: 1.1, stamina: 1, grail: "Illustration Rare",
    chase: { name: "Xerneas", match: ["xerneas"], sets: ["me4"] },
    voice: [
      "just here for the art honestly",
      "don't care about value, care about illustration",
      "the illustration rares carry this whole hobby",
      "some of these belong in a gallery",
      "i'd frame half these cards",
      "chasing art not money",
      "this artist did something special",
      "kalos art was a peak and nobody says it",
    ],
  },
  {
    name: "Cass", handle: "cassidy_r", color: "flame", avatar: "609",
    banner: "beam:flame+ember", bio: "",
    hours: [10, 19], sets: ["me5", "rsv10pt5"], titles: ["Double rare", "Trainer"],
    mood: "hyped", temper: "spender", chatty: 1.2, stamina: 1, grail: "Ultra Rare",
    chase: { name: "Chandelure", match: ["litwick", "lampent", "chandelure"], sets: ["me5", "rsv10pt5"] },
    voice: [
      "fire types run this",
      "hot streak. relatively speaking",
      "that art is genuinely so good",
      "opening on a whim and regretting it",
      "the red binder page is looking good",
      "the flame art in this set goes hard",
      "ghost fire is the best typing and it's not close",
      "spending it all, obviously",
    ],
  },
  {
    name: "Ravi", handle: "ravioli", color: "poison", avatar: "169",
    banner: "drift:poison+violet", bio: "chasing the gold",
    hours: [18, 5], sets: ["me4", "me2pt5"], titles: ["Gold chaser", "Century"],
    mood: "salty", temper: "flipper", chatty: 1, stamina: 1.1, grail: "Mega Hyper Rare",
    chase: { name: "Crobat", match: ["zubat", "golbat", "crobat"], sets: ["me4"] },
    voice: [
      "chasing the gold",
      "gold or nothing, i've said this before",
      "poison types are underrated",
      "i want the shiny gold one specifically",
      "the gold chase continues",
      "still nothing gold. still going",
      "selling everything that isn't the goal",
      "the dupe pile funds the dream",
    ],
  },
  {
    name: "Bex", handle: "bexlyn", color: "gold", avatar: "25",
    banner: "pulse:gold+thunder", bio: "",
    hours: [8, 17], sets: ["me2pt5", "me3"], titles: ["Hourly", "Ripper"],
    mood: "hyped", temper: "spender", chatty: 1.2, stamina: 0.9, grail: "Special Illustration Rare",
    chase: { name: "Pikachu", match: ["pikachu", "pichu", "raichu"], sets: ["me2pt5"] },
    voice: [
      "the hourly stack is carrying me",
      "classic types only",
      "spending it the second i get it",
      "this is a healthy hobby",
      "the yellow page is coming along",
      "free coins go straight back in",
      "never learned to save. clearly",
      "the mouse is the whole point",
    ],
  },
  {
    name: "Milo", handle: "milohaze", color: "forest", avatar: "724",
    banner: "mist:forest+lime", bio: "grass starters or nothing",
    hours: [20, 6], sets: ["me3", "me1"], titles: ["Marathon", "Ripper"],
    mood: "calm", temper: "steady", chatty: 0.9, stamina: 1.3, grail: "Ultra Rare",
    chase: { name: "Decidueye", match: ["rowlet", "dartrix", "decidueye"], sets: ["me3"] },
    voice: [
      "grass starters are the best starters",
      "still nothing green worth pinning",
      "one good pull and i'm done for the night",
      "the forest page is my favourite page",
      "chasing a card nobody else wants",
      "owls specifically. i have a type",
      "the alola art is so warm",
      "long night, slow burn",
    ],
  },
  {
    name: "Sena", handle: "senaaa", color: "ghost", avatar: "94",
    banner: "pulse:ghost+night", bio: "gengar hoarder",
    hours: [21, 7], sets: ["me2pt5", "me3"], titles: ["Ultra", "Hit hunter"],
    mood: "salty", temper: "flipper", chatty: 1.1, stamina: 1, grail: "Mega Attack Rare",
    chase: { name: "Gengar", match: ["gastly", "haunter", "gengar"], sets: ["me2pt5"] },
    voice: [
      "gengar hoarder, no apologies",
      "ghost types after dark obviously",
      "the spooky page is coming together",
      "purple cards only please",
      "i own too many gengars and want more",
      "the ghost art in this set is unreal",
      "not stopping until the page is full",
      "selling the rest to fund the ghosts",
    ],
  },
  {
    name: "Hollis", handle: "hollisj", color: "earth", avatar: "530",
    banner: "beam:earth+rock", bio: "",
    hours: [13, 22], sets: ["zsv10pt5", "me5"], titles: ["Loaded", "Banked", "Trainer"],
    mood: "calm", temper: "saver", chatty: 0.7, stamina: 1, grail: "Special Illustration Rare",
    chase: { name: "Excadrill", match: ["drilbur", "excadrill"], sets: ["me5", "zsv10pt5"] },
    voice: [
      "ground types are underrated",
      "slow build, good binder",
      "not chasing value, chasing the set",
      "the earth tones page is nearly full",
      "completion over chase, always",
      "master setting this one",
      "one card closer",
      "banking coins is a strategy actually",
    ],
  },
  {
    name: "Piper", handle: "piperpip", color: "rock", avatar: "95",
    banner: "drift:rock+earth", bio: "onix enthusiast, no notes",
    hours: [11, 21], sets: ["me1", "me2"], titles: ["Collector", "Trainer"],
    mood: "dry", temper: "steady", chatty: 0.9, stamina: 0.9, grail: "Illustration Rare",
    chase: { name: "Steelix", match: ["onix", "steelix"], sets: ["me1"] },
    voice: [
      "onix enthusiast, no notes",
      "rock types deserve more love",
      "nobody chases these, more for me",
      "the grey page is my pride",
      "still building slowly",
      "rock solid pulls today. sorry",
      "completing this set out of spite",
      "underrated types only",
    ],
  },
  {
    name: "Ada", handle: "adawrites", color: "dragon", avatar: "149",
    banner: "aurora:dragon+ocean", bio: "",
    hours: [16, 3], sets: ["me2pt5", "zsv10pt5"], titles: ["Banked", "Loaded"],
    mood: "calm", temper: "saver", chatty: 0.8, stamina: 1.1, grail: "Mega Hyper Rare",
    chase: { name: "Dragonite", match: ["dratini", "dragonair", "dragonite"], sets: ["me2pt5"] },
    voice: [
      "dragons or nothing",
      "saving up for a proper run",
      "the dragon page is my favourite",
      "slowly getting there",
      "big pulls come to those who wait",
      "banking coins for once",
      "this set's dragons are gorgeous",
      "patience is a pull strategy",
    ],
  },
  {
    name: "Toby", handle: "tobes", color: "bug", avatar: "637",
    banner: "mist:bug+lime", bio: "bug types deserve a chase card",
    hours: [9, 19], sets: ["zsv10pt5", "rsv10pt5"], titles: ["Ripper", "Trainer"],
    mood: "warm", temper: "steady", chatty: 1, stamina: 0.9, grail: "Illustration Rare",
    chase: { name: "Volcarona", match: ["larvesta", "volcarona"], sets: ["zsv10pt5"] },
    voice: [
      "bug types are genuinely good, fight me",
      "the bug art in this era is so clean",
      "nobody rates bugs and it's their loss",
      "the green page is slowly filling",
      "one good bug pull, that's all",
      "underrated as always",
      "unova did bugs properly",
      "the moth is a work of art",
    ],
  },
  {
    name: "Vic", handle: "vicvic", color: "violet", avatar: "282",
    banner: "pulse:violet+fairy", bio: "gardevoir. that is the whole bio",
    hours: [19, 5], sets: ["me1", "me2pt5"], titles: ["Illustration", "Binder rat"],
    mood: "hyped", temper: "spender", chatty: 1.1, stamina: 1, grail: "Mega Hyper Rare",
    chase: { name: "Gardevoir", match: ["ralts", "kirlia", "gardevoir"], sets: ["me1"] },
    voice: [
      "gardevoir. that is the whole bio",
      "psychic art is unmatched",
      "the illustration rares are the whole point",
      "chasing one card forever",
      "fairy psychic supremacy",
      "this artist understood the assignment",
      "my binder is one pokemon repeated",
      "ralts counts. it's the same family",
    ],
  },
  {
    name: "Noa", handle: "noaquartz", color: "thunder", avatar: "310",
    banner: "beam:thunder+ember", bio: "",
    hours: [14, 23], sets: ["me5", "me1"], titles: ["Century", "Hit hunter"],
    mood: "dry", temper: "steady", chatty: 0.8, stamina: 1, grail: "Ultra Rare",
    chase: { name: "Manectric", match: ["electrike", "manectric"], sets: ["me5", "me1"] },
    voice: [
      "electric types and good art",
      "steady pulls, no complaints",
      "the yellow page is filling up",
      "opening between other things",
      "not chasing, just collecting",
      "this set treats me well",
      "good art beats good odds",
      "hoenn electric is a small club",
    ],
  },
  {
    name: "Ren", handle: "renfield", color: "night", avatar: "359",
    banner: "mist:night+poison", bio: "absol truther",
    hours: [0, 9], sets: ["me1", "me2"], titles: ["Hit hunter", "Ripper"],
    mood: "salty", temper: "spender", chatty: 0.9, stamina: 1.1, grail: "Special Illustration Rare",
    chase: { name: "Absol", match: ["absol"], sets: ["me1"] },
    voice: [
      "absol truther",
      "dark types are the best designed",
      "nobody appreciates absol enough",
      "late nights and dark types",
      "the black border art is so good",
      "chasing one specific card as usual",
      "moody cards only",
      "still nothing. still going",
    ],
  },
  {
    name: "Suki", handle: "sukisuki", color: "aqua", avatar: "121",
    banner: "drift:aqua+ice", bio: "",
    hours: [12, 20], sets: ["me3", "rsv10pt5"], titles: ["Collector", "Trainer"],
    mood: "warm", temper: "steady", chatty: 0.8, stamina: 0.9, grail: "Ultra Rare",
    chase: { name: "Starmie", match: ["staryu", "starmie"], sets: ["me3"] },
    voice: [
      "water types forever",
      "just opening quietly",
      "the blue page is my favourite",
      "slow collector, no rush",
      "not chasing anything expensive",
      "this set is gentle on the eyes",
      "one more then i'm done",
      "the star ones are so clean",
    ],
  },
];

/**
 * Filler for a persona with nothing of its own left to say — and the only
 * pool in this file that is not either persona-written or built out of that
 * persona's chase, so it is deliberately the last thing reached for.
 *
 * Nothing here asserts a fact a visitor could check. A bot's packs opened,
 * coins, and collection are all on its public profile, so a line like
 * "finally cracked 100 packs" from an account showing nine is the thing that
 * gives the whole roster away. Anything countable goes through
 * MILESTONE_LINES, which only fire on a number the save actually holds.
 */
const IDLE_LINES = [
  "back to the mines",
  "ok one more pack then i'm done. lying",
  "three in a row with nothing. cool",
  "the pull rates on this set are brutal",
  "why do i always get the same rare",
  "reverse holos hit different",
  "just watched my coins evaporate",
  "someone tell me to stop opening",
  "down bad, zero hits today",
  "at least the commons look nice",
  "my luck is unbelievable and not in a good way",
];

/**
 * The hunt, in the persona's own words. Rendered with that bot's chase, so
 * twelve templates give every persona twelve lines no other persona says —
 * "still no metagross" is Otto and reads as Otto.
 */
const CHASE_LINES = [
  (c) => `still no ${c}`,
  (c) => `${c} or nothing`,
  (c) => `the ${c} page has one hole in it and it's the same hole`,
  (c) => `every pack is a ${c} pack until it isn't`,
  (c) => `i only want the ${c}. that's it. that's the ask`,
  (c) => `opened another. no ${c}`,
  (c) => `the ${c} is avoiding me personally`,
  (c) => `i'd trade the whole binder for one ${c}`,
  (c) => `${c} hunt continues`,
  (c) => `if i see one more not-${c} i'm going to say something`,
  (c) => `chasing ${c} and losing, as usual`,
  (c) => `${c}. one. that's all i've ever asked for`,
];

/** The moment the hunt pays off. `card` is the real printed name. */
const CHASE_FOUND = [
  (chase, card) => `${card}. the hunt is over`,
  (chase, card) => `${chase}!! ${card} finally`,
  (chase, card) => `after all that. ${card}`,
  (chase, card) => `${card} is going straight in the showcase`,
  (chase, card) => `i have been asking for a ${chase}. ${card}`,
  (chase, card) => `${card}. that's the one. that's the whole reason i open packs`,
  (chase, card) => `hands shaking. ${card}`,
  (chase, card) => `${card} pinned. nothing else matters today`,
  (chase, card) => `got there. ${card}`,
  (chase, card) => `${card}, on a night i nearly didn't open anything`,
];

/** Someone else pulled the card this bot is hunting. */
const CHASE_ENVY = [
  (c) => `that's my ${c}. that's the exact one i'm hunting`,
  (c) => `you got the ${c} before me. i'm fine`,
  (c) => `${c}. of course. i've been asking for that card`,
  (c) => `hand over the ${c}`,
  (c) => `genuinely happy for you. it's a ${c} though. i want it`,
  (c) => `some of us are still looking for that ${c}`,
];

/** Their favourite rarity, which is a smaller ambition than the chase. */
const GRAIL_LINES = [
  (rarity, card) => `${card}. ${an(rarity)}. that's the rarity i'm here for`,
  (rarity, card) => `${rarity} pull. ${card}. good night for it`,
  (rarity, card) => `${card}. i collect this rarity specifically`,
  (rarity, card) => `${an(rarity)}, finally. ${card}`,
  (rarity, card) => `${card}. that's the slot i wait on every pack`,
];

/**
 * Replies to another bot, chosen by what that bot had just said and coloured
 * by the mood of whoever is answering. Warm and salty read the same pull very
 * differently, which is what stops the room agreeing with itself all evening.
 *
 * These only ever fire at a handle on the roster. A bot answering a real
 * person would be the most obvious tell there is — an account that cannot
 * actually hold the conversation it just started.
 */
const REACTIONS = {
  hit: {
    warm: [
      "no way, congrats",
      "that's a lovely pull",
      "genuinely happy for you",
      "ok that one's gorgeous",
      "you deserve that one",
      "what a card",
    ],
    salty: [
      "ok i'm jealous",
      "meanwhile i get nothing",
      "of course you get it",
      "some people have all the luck",
      "i've opened plenty and nothing",
      "please share whatever that is",
    ],
    dry: [
      "nice",
      "good for you. genuinely",
      "unbelievable, in the literal sense",
      "that'll do",
      "sure, why not",
      "well spotted",
    ],
    hyped: [
      "no wayyy",
      "that's insane",
      "sick pull",
      "i'm losing it on your behalf",
      "ok that's a banger",
      "absolutely not fair and i love it",
    ],
    calm: [
      "lovely pull",
      "that's a good one",
      "nice find",
      "well earned",
      "the art on that is great",
      "good pack",
    ],
  },
  chase: {
    warm: [
      "you've been after that one forever, congrats",
      "the hunt's over then. lovely",
      "ok that's the good ending",
      "so pleased for you honestly",
      "that's the one you wanted. brilliant",
      "worth every pack then",
    ],
    salty: [
      "the one card you wanted. obviously",
      "must be nice to actually find yours",
      "still waiting on mine, by the way",
      "the game gives it to you and not me. cool",
      "congrats. through gritted teeth",
      "so it does exist",
    ],
    dry: [
      "well that's you done then",
      "closing the binder, are we",
      "so what do you even open now",
      "took you long enough",
      "the search ends. tragic",
      "good. stop talking about it now",
    ],
    hyped: [
      "the actual chase card!! no way",
      "that's the one!! that's the whole thing!!",
      "screaming for you right now",
      "ok that's the pull of the night",
      "you got it you got it you got it",
      "this is huge, genuinely",
    ],
    calm: [
      "that's the one you were after. nice",
      "good end to a long chase",
      "well earned, that",
      "the right card to the right person",
      "lovely. pin it",
      "patience paid off then",
    ],
  },
  milestone: [
    "congrats",
    "ok that's dedication",
    "how do you have the coins",
    "respect",
    "that's a lot of packs",
    "nice one",
    "the grind is real",
  ],
  sell: [
    "the dupe pile always wins",
    "bulk pays the bills",
    "same, half my binder is gone",
    "selling doubles is the real economy",
    "had to do the same earlier",
    "the doubles fund everything",
  ],
  broke: [
    "felt",
    "same honestly",
    "we've all been there",
    "waiting on the hourly too",
    "rough",
    "the coins never last",
  ],
  idle: {
    warm: ["real", "same honestly", "you're not wrong", "this is the life", "couldn't agree more"],
    salty: ["at least you're opening", "must be nice", "join the club", "wait till it gets worse", "cope"],
    dry: ["hm", "sure", "that's one way to put it", "quite", "it do be like that"],
    hyped: ["lol same", "every single time", "this!!", "so real", "yes exactly"],
    calm: ["mm, agreed", "same here", "it happens", "that's the hobby", "fair"],
  },
};

/** Which REACTIONS table answers a given last_chat_kind. */
const REACT_KIND = { grail: "hit" };

const SELL_LINES = [
  () => "dumped some dupes, back in business",
  () => "selling doubles to fund the next one",
  () => "ok that's the dupe pile gone",
  () => "cleared out the triples, felt good",
  () => "the bulk had to go",
  () => "traded quantity for a chance, as usual",
  (chase) => `sold the spares. ${chase} fund`,
  (chase) => `everything that isn't a ${chase} is currency`,
];

const BROKE_LINES = [
  () => "and i'm broke again",
  () => "out of coins, waiting on the hourly",
  () => "zero coins. cool cool cool",
  () => "spent it. all of it. instantly",
  () => "the balance is a rounding error",
  () => "nothing left to open with",
  (chase) => `no coins, no ${chase}, no notes`,
  (chase) => `broke, and still no ${chase}`,
];

/** Only ever said on a number the profile actually shows. */
const MILESTONE_PACKS = [25, 50, 100, 250, 500, 1000];

const MILESTONE_LINES = [
  (packs) => `${packs} packs deep`,
  (packs) => `just hit ${packs} packs`,
  (packs) => `${packs} packs and still chasing`,
  (packs) => `${packs} packs. i should probably stop`,
  (packs) => `that's ${packs} packs opened. no regrets`,
  (packs) => `${packs} in. the binder is filling up`,
  (packs) => `somehow at ${packs} packs already`,
];

/**
 * A good pull that is not the thing they are hunting. Nothing here claims a
 * chase — every persona has a real one now, and "been chasing energy switch
 * forever" out of a bot whose bio says metagross is worse than saying nothing.
 */
const HIT_LINES = [
  (name) => `${name} out of nowhere`,
  (name) => `no way. ${name}`,
  (name) => `ok that pack was worth it. ${name}`,
  (name) => `${name}!!`,
  (name) => `${name} on the last card of the pack`,
  (name) => `i did not expect ${name} today`,
  (name) => `${name} is going straight in the binder`,
  (name) => `okay ${name} was worth every coin`,
  (name) => `not what i'm after but ${name} will do`,
  (name) => `well that's the pack paid for. ${name}`,
  (name) => `${name}. i'll take it`,
  (name) => `${name} and i have no notes`,
  (name) => `the art on ${name} is unreasonable`,
  (name) => `${name}, which was not on the list`,
  (name) => `pulled ${name} and immediately screamed`,
  (name) => `${name}. that'll look good on the wall`,
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
    const adds = [
      // coins = -1 means "never read", which is what forces the first sync.
      ["coins", "ALTER TABLE bots ADD COLUMN coins REAL NOT NULL DEFAULT -1"],
      ["last_daily", "ALTER TABLE bots ADD COLUMN last_daily INTEGER NOT NULL DEFAULT 0"],
      ["showcase", "ALTER TABLE bots ADD COLUMN showcase TEXT"],
      ["last_chat_kind", "ALTER TABLE bots ADD COLUMN last_chat_kind TEXT"],
      ["recent_lines", "ALTER TABLE bots ADD COLUMN recent_lines TEXT"],
      ["last_react_id", "ALTER TABLE bots ADD COLUMN last_react_id INTEGER NOT NULL DEFAULT 0"],
      // Cards matching this persona's chase, so the sell branch never dumps one.
      ["chase_ids", "ALTER TABLE bots ADD COLUMN chase_ids TEXT"],
      // The set this session is opening, picked once at wake.
      ["session_set", "ALTER TABLE bots ADD COLUMN session_set TEXT"],
      // Stamp of the persona's avatar/banner/bio, so edits here reach accounts
      // that already exist instead of only new signups.
      ["look", "ALTER TABLE bots ADD COLUMN look TEXT"],
    ];
    for (const [name, sql] of adds) {
      if (!cols.has(name)) await runDdl(env, sql);
    }
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

function temperOf(persona) {
  return TEMPERS[persona.temper] || TEMPERS.steady;
}

function chaseName(persona) {
  return String(persona.chase?.name || "").toLowerCase();
}

/** Sets this persona is allowed to open, its chase's sets always included. */
function playableSets(persona) {
  const wanted = [...(persona.sets || []), ...(persona.chase?.sets || [])];
  const live = [...new Set(wanted)]
    .filter((id) => BOT_SETS.includes(id))
    .filter((id) => PLAYABLE_SETS.some((set) => set.id === id));
  return live.length ? live : [PLAYABLE_SETS[0].id];
}

/** Where the chase is actually printed, minus anything retired since. */
function huntSets(persona) {
  const live = playableSets(persona);
  return (persona.chase?.sets || []).filter((id) => live.includes(id));
}

/**
 * A player opens the set their card is in, most of the time. Chosen once when
 * a session starts rather than per tick, because someone who switches set
 * every minute for an hour is not someone.
 */
function pickSet(persona) {
  const hunt = huntSets(persona);
  if (hunt.length && Math.random() < CHASE_SET_BIAS) return pick(hunt);
  return pick(playableSets(persona));
}

function sessionSet(persona, row) {
  const live = playableSets(persona);
  return live.includes(String(row.session_set)) ? String(row.session_set) : pickSet(persona);
}

/**
 * Does this text name the line the persona hunts?
 *
 * Whole words only. Plain `includes` reads "absol" out of "absolutely not fair
 * and i love it", which is enough to have Ren answering a stray adverb as if
 * someone had pulled his card.
 */
function namesChase(persona, text) {
  const match = persona.chase?.match;
  if (!Array.isArray(match) || !text) return false;
  const said = String(text).toLowerCase();
  return match.some((frag) => new RegExp(`\\b${frag}\\b`).test(said));
}

function matchesChase(persona, card) {
  return namesChase(persona, card?.name);
}

/** The best card in a pull that belongs to this persona's chase, if any. */
function chaseIn(persona, cards) {
  const mine = (cards || []).filter((card) => matchesChase(persona, card));
  if (!mine.length) return null;
  const hits = mine.filter(isHit);
  const pool = hits.length ? hits : mine;
  return pool.reduce((best, card) => (sellValue(card) > sellValue(best) ? card : best), pool[0]);
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

/** What the persona's public face should be, as one comparable stamp. */
function lookOf(persona) {
  return `${persona.avatar}|${persona.banner}|${persona.bio || ""}`;
}

async function signIn(env, call, persona, helpers) {
  const password = await botPassword(env, persona.handle);
  const credentials = { handle: persona.handle, password };
  let res = await call("/api/auth/signin", { method: "POST", body: credentials });
  let created = false;

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
          avatarStyle: "art",
          banner: persona.banner,
          bio: persona.bio || "",
        },
      });
      created = true;
    }
  }
  if (!res.cookie || !res.body?.user) return null;
  return { cookie: res.cookie, userId: res.body.user.id, created };
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
        `INSERT INTO bots (user_id, handle, cookie, online_until, next_wake, last_chat_at, look)
         VALUES (?, ?, ?, 0, ?, 0, ?)
         ON CONFLICT(user_id) DO UPDATE SET cookie = excluded.cookie`
      )
        .bind(
          next.userId,
          persona.handle,
          next.cookie,
          now + rand(0, FIRST_WAKE_MS),
          // Only a fresh signup has just been dressed; anything else syncs on
          // its first action rather than claiming a look it may not have.
          next.created ? lookOf(persona) : null
        )
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
 * Put the persona's avatar, banner, and bio back on the account when the
 * roster above has been edited. Without it a persona's face is frozen at
 * whatever it was on the day it signed up.
 */
async function syncLook(env, call, row, persona, cookie) {
  const want = lookOf(persona);
  if (row.look === want) return;
  const res = await call("/api/me", {
    method: "PATCH",
    cookie,
    body: {
      avatar: persona.avatar,
      avatarStyle: "art",
      banner: persona.banner,
      bio: persona.bio || "",
    },
  });
  if (res.status !== 200) return;
  row.look = want;
  await env.DB.prepare("UPDATE bots SET look = ? WHERE user_id = ?").bind(want, row.user_id).run();
}

/**
 * Post a line and remember it.
 *
 * `kind` is what another bot reads to decide how to answer — congratulating a
 * pull reads very differently from agreeing with a complaint.
 */
async function say(env, call, row, cookie, text, now, kind = "idle") {
  if (!text) return;
  const res = await call("/api/chat", { method: "POST", cookie, body: { body: text } });
  if (res.status !== 200) return;

  const recent = [text, ...readRecent(row.recent_lines)].slice(0, RECENT_LINES);
  row.last_chat_at = now;
  row.last_chat_kind = kind;
  row.recent_lines = JSON.stringify(recent);
  await env.DB.prepare(
    "UPDATE bots SET last_chat_at = ?, last_chat_kind = ?, recent_lines = ? WHERE user_id = ?"
  )
    .bind(now, kind, row.recent_lines, row.user_id)
    .run();
}

function readList(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const readRecent = readList;
const readChaseIds = readList;

function normalizeLine(text) {
  return String(text || "").trim().toLowerCase();
}

/** "an illustration rare", "a mega hyper rare". */
function an(phrase) {
  return `${/^[aeiou]/i.test(String(phrase)) ? "an" : "a"} ${phrase}`;
}

/** Every line currently visible in the lounge, whoever said it. */
function onScreen(chat) {
  const seen = new Set();
  for (const message of Array.isArray(chat) ? chat : []) {
    seen.add(normalizeLine(message?.body));
  }
  return seen;
}

/**
 * Pick a line nobody is currently looking at.
 *
 * The old rule was per-bot: don't repeat yourself within ten lines. That still
 * let twenty-four accounts take turns posting "same" down a single screen,
 * which is the repetition a regular actually notices. So the hard rule is now
 * the room's, not the bot's — nothing already on the lounge board can be said
 * again — and returning null means the persona has nothing fresh and stays
 * quiet this tick. Silence is always better than an echo.
 */
function pickFresh(pool, row, seen) {
  const list = (Array.isArray(pool) ? pool : []).filter((line) => typeof line === "string" && line);
  if (!list.length) return null;
  const board = seen instanceof Set ? seen : new Set();
  const unseen = list.filter((line) => !board.has(normalizeLine(line)));
  if (!unseen.length) return null;
  const recent = new Set(readRecent(row.recent_lines).map(normalizeLine));
  const unsaid = unseen.filter((line) => !recent.has(normalizeLine(line)));
  return pick(unsaid.length ? unsaid : unseen);
}

/** What this persona has to say when nothing has just happened. */
function voiceOf(persona) {
  const lines = [...(persona.voice || [])];
  const chase = chaseName(persona);
  if (chase) for (const line of CHASE_LINES) lines.push(line(chase));
  return lines.length ? lines : IDLE_LINES;
}

function reactionPool(kind, persona) {
  const table = REACTIONS[REACT_KIND[kind] || kind] || REACTIONS.idle;
  if (Array.isArray(table)) return table;
  return table[persona.mood] || table.dry || Object.values(table)[0] || IDLE_LINES;
}

/**
 * Every bot talking on the same clock is a tell, so the gap is spread 14-34
 * minutes by handle — stable per persona, different between them — then scaled
 * by how talkative that persona is.
 */
function chatGapFor(persona) {
  let h = 0;
  for (const ch of persona.handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = (14 + (h % 21)) * MINUTE;
  return Math.round(base / (Number(persona.chatty) || 1));
}

/**
 * Answer the last thing another bot said.
 *
 * Hard requirement: the speaker must be on the roster. Reacting to whatever
 * happens to be last would eventually mean replying to a real person, and an
 * account that cannot hold up its end is exactly what gives the game away.
 */
/**
 * The message this persona would answer, if it answers anything.
 *
 * Normally the newest line on the board, but a recent one naming its chase
 * outranks that: a Gardevoir collector who watches someone pull a Gardevoir
 * two messages ago and says "same" to whatever came after is not collecting
 * anything. Only ever messages newer than the last one it answered, so
 * scanning back can never walk the conversation backwards.
 */
function reactTarget(persona, chat, row, now) {
  const usable = (Array.isArray(chat) ? chat : []).slice(-REACT_SCAN).filter((message) => {
    const handle = message?.user?.handle;
    if (!handle || handle === persona.handle) return false;
    if (!ROSTER.some((item) => item.handle === handle)) return false;
    if (Number(message.id) <= Number(row.last_react_id || 0)) return false;
    return now - Number(message.at || 0) <= REACT_WINDOW_MS;
  });
  if (!usable.length) return null;
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    if (namesChase(persona, usable[i].body)) return usable[i];
  }
  return usable[usable.length - 1];
}

async function react(env, call, row, persona, cookie, chat, now, seen) {
  if (now - Number(row.last_chat_at || 0) < REACT_GAP_MS) return false;

  const last = reactTarget(persona, chat, row, now);
  if (!last) return false;
  const speaker = ROSTER.find((item) => item.handle === last.user.handle);

  // Someone else naming the card this persona hunts is the one thing it will
  // nearly always have an opinion about, so it clears a much lower bar than
  // the usual garnish.
  const named = namesChase(persona, last.body);
  if (Math.random() > (named ? CHASE_REACT_CHANCE : REACT_CHANCE * (Number(persona.chatty) || 1))) {
    return false;
  }

  const theirs = await env.DB.prepare("SELECT last_chat_kind FROM bots WHERE handle = ?")
    .bind(speaker.handle)
    .first();
  const kind = theirs?.last_chat_kind || "idle";

  // Never answer an answer. Without this each reaction becomes the next thing
  // to react to and the room collapses into "same" / "real" / "agreed".
  if (kind === "react") return false;
  // A pull or a milestone is worth speaking up for. Everything else only
  // sometimes, so the personas still get to say their own lines.
  if (!named && !REACT_EAGER.has(kind) && Math.random() > 0.3) return false;

  // "hand over the metagross" only makes sense if a metagross was actually
  // pulled — someone merely complaining about not finding one gets a normal
  // answer instead.
  const pool = named && PULL_KINDS.has(kind)
    ? CHASE_ENVY.map((line) => line(chaseName(persona)))
    : reactionPool(kind, persona);

  const text = pickFresh(pool, row, seen);
  if (!text) return false;

  await env.DB.prepare("UPDATE bots SET last_react_id = ? WHERE user_id = ?")
    .bind(Number(last.id) || 0, row.user_id)
    .run();
  row.last_react_id = Number(last.id) || 0;

  await say(env, call, row, cookie, text, now, "react");
  return true;
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
  await env.DB.prepare("UPDATE bots SET coins = ?, last_daily = ? WHERE user_id = ?")
    .bind(row.coins, row.last_daily, row.user_id)
    .run();
}

/** Card ids from this persona's chase are kept, never sold. */
async function rememberChase(env, row, persona, cards) {
  const held = readChaseIds(row.chase_ids);
  const known = new Set(held);
  const found = (cards || [])
    .filter((card) => matchesChase(persona, card))
    .map((card) => String(card.id))
    .filter((id) => !known.has(id));
  if (!found.length) return;

  const next = [...found, ...held].slice(0, CHASE_IDS_MAX);
  row.chase_ids = JSON.stringify(next);
  await env.DB.prepare("UPDATE bots SET chase_ids = ? WHERE user_id = ?")
    .bind(row.chase_ids, row.user_id)
    .run();
}

/**
 * A player who logs in to an hourly stack spends it, but not all of them spend
 * it the same way. Odds climb with how many packs the balance covers, from a
 * floor and toward a ceiling their temper sets, and a saver refuses to open at
 * all until it is holding a buffer. Held flat, every bot earned 100 coins an
 * hour, opened about six packs with it, and grew a balance no real trainer
 * would sit on — and every profile looked the same doing it.
 *
 * The catalog cost is close enough to pace against; the worker prices the pack
 * off sealed.json when it actually charges for it.
 */
function ripChance(coins, cost, persona) {
  const temper = temperOf(persona);
  if (!(cost > 0)) return 0;
  if (coins < cost * (1 + temper.hold)) return 0;
  return Math.min(temper.ceil, temper.floor + (coins / cost) * temper.per);
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
 * Put the best pulls on the profile, led by the chase.
 *
 * A player who lands a chase card sets it as their showcase; a bot whose six
 * slots stay empty while its binder fills is showing you exactly what it is.
 * The rest are ranked by sell value rather than rarity, so those slots hold
 * what is actually worth something — a Double Rare worth pennies never
 * displaces an illustration rare. But CHASE_SLOTS of the six are held for the
 * line the persona actually collects, because a Metagross collector whose
 * profile leads with a Wailord is not a collector.
 *
 * It only PATCHes when the ranking genuinely changes, which after the first
 * few packs is rare.
 */
async function showcaseBest(env, call, row, persona, cookie, cards) {
  const held = readShowcase(row.showcase);
  const chaseIds = new Set(readChaseIds(row.chase_ids));
  const merged = held.map((slot) => ({
    ...slot,
    chase: Boolean(slot.chase) || chaseIds.has(String(slot.id)),
  }));

  for (const card of cards || []) {
    if (!isHit(card)) continue;
    if (merged.some((slot) => slot.id === card.id)) continue;
    merged.push({
      id: card.id,
      reverse: Boolean(card.reverse),
      value: Number(sellValue(card)) || 0,
      chase: matchesChase(persona, card),
    });
  }

  const byValue = (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0);
  const pinned = merged.filter((slot) => slot.chase).sort(byValue).slice(0, CHASE_SLOTS);
  const rest = merged.filter((slot) => !pinned.includes(slot)).sort(byValue);
  const next = [...pinned, ...rest].slice(0, SHOWCASE_MAX);
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
async function openOrSell(env, call, row, persona, cookie, setId, quiet, now, seen) {
  const temper = temperOf(persona);
  const chase = chaseName(persona);

  if (Number(row.coins) < temper.sellAt) {
    // The collection is only pulled on this branch, which is rare — it is the
    // one decision the cached balance alone cannot answer.
    const mine = await call("/api/me", { cookie });
    const collection = mine.body?.save?.collection || {};
    if (mine.body?.save) await remember(env, row, mine.body.save);

    // Never sell the thing you collect, and never sell what is on the profile.
    const keep = new Set([
      ...readChaseIds(row.chase_ids),
      ...readShowcase(row.showcase).map((slot) => String(slot.id)),
    ]);
    const dupes = Object.keys(collection)
      .filter((id) => collection[id] > 1 && !keep.has(id))
      .sort((a, b) => collection[b] - collection[a]);

    if (dupes.length) {
      // Off the top of the deepest stacks, the way anyone clears bulk.
      const sold = await call("/api/cards/sell", {
        method: "POST",
        cookie,
        body: { cardId: pick(dupes.slice(0, 3)) },
      });
      if (sold.body?.save) await remember(env, row, sold.body.save);
      if (sold.status === 200 && quiet && Math.random() < CHAT_CHANCE) {
        const text = pickFresh(SELL_LINES.map((line) => line(chase)), row, seen);
        await say(env, call, row, cookie, text, now, "sell");
      }
      return;
    }
  }

  const ripped = await call("/api/packs/rip", { method: "POST", cookie, body: { setId } });

  if (ripped.status !== 200) {
    // Refused, so the cached balance was optimistic. Zero it so the next tick
    // goes looking for doubles to sell instead of asking again.
    row.coins = 0;
    await env.DB.prepare("UPDATE bots SET coins = 0 WHERE user_id = ?").bind(row.user_id).run();
    if (quiet && Math.random() < CHAT_CHANCE) {
      const text = pickFresh(BROKE_LINES.map((line) => line(chase)), row, seen);
      await say(env, call, row, cookie, text, now, "broke");
    }
    return;
  }

  const cards = ripped.body?.cards || [];
  await remember(env, row, ripped.body?.save);
  await rememberChase(env, row, persona, cards);
  // Before anything is said, so a line about pinning it is already true.
  await showcaseBest(env, call, row, persona, cookie, cards);
  if (!quiet) return;

  // The card they are here for outranks everything else they could mention.
  const found = chaseIn(persona, cards);
  if (found && isHit(found) && Math.random() < CHASE_CHAT_CHANCE) {
    const name = String(found.name).toLowerCase();
    const text = pickFresh(CHASE_FOUND.map((line) => line(chase, name)), row, seen);
    if (text) {
      await say(env, call, row, cookie, text, now, "chase");
      return;
    }
  }

  const packs = Number(ripped.body?.save?.packsOpened || 0);
  if (MILESTONE_PACKS.includes(packs)) {
    const text = pickFresh(MILESTONE_LINES.map((line) => line(packs)), row, seen);
    if (text) {
      await say(env, call, row, cookie, text, now, "milestone");
      return;
    }
  }

  const grail = cards.find((card) => !card.reverse && card.rarity === persona.grail);
  if (grail && Math.random() < GRAIL_CHAT_CHANCE) {
    const label = String(RARITY_LABEL[persona.grail] || persona.grail).toLowerCase();
    const name = String(grail.name).toLowerCase();
    const text = pickFresh(GRAIL_LINES.map((line) => line(label, name)), row, seen);
    if (text) {
      await say(env, call, row, cookie, text, now, "grail");
      return;
    }
  }

  const hit = cards.find((card) => !card.reverse && CHAT_WORTHY.has(card.rarity));
  if (hit && Math.random() < HIT_CHAT_CHANCE) {
    const name = String(hit.name).toLowerCase();
    const text = pickFresh(HIT_LINES.map((line) => line(name)), row, seen);
    await say(env, call, row, cookie, text, now, "hit");
  }
}

/**
 * One thing per minute at most. Reading the lounge is what marks a bot online
 * in the first place — everything after it is optional.
 */
async function act(env, call, row, persona, now, helpers) {
  const cookie = await session(env, call, row, persona, helpers);
  if (!cookie) return;

  const lounge = await call("/api/lounge", { cookie });
  if (lounge.status === 401) {
    await clearSession(env, row);
    return;
  }
  const seen = onScreen(lounge.body?.chat);

  const quiet = now - Number(row.last_chat_at || 0) >= chatGapFor(persona);

  // Answering another bot comes first: it is the only thing here that depends
  // on a message still being recent.
  if (await react(env, call, row, persona, cookie, lounge.body?.chat, now, seen)) return;

  await syncLook(env, call, row, persona, cookie);

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

  const setId = sessionSet(persona, row);
  const temper = temperOf(persona);
  const broke = Number(row.coins) >= 0 && Number(row.coins) < temper.sellAt;
  if (Math.random() < ripChance(Number(row.coins), costOf(setId), persona) || (broke && Math.random() < 0.25)) {
    await openOrSell(env, call, row, persona, cookie, setId, quiet, now, seen);
    return;
  }

  if (quiet && Math.random() < CHAT_CHANCE * (Number(persona.chatty) || 1)) {
    const text = pickFresh(voiceOf(persona), row, seen) || pickFresh(IDLE_LINES, row, seen);
    if (text) {
      await say(env, call, row, cookie, text, now, "idle");
      return;
    }
  }
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
    await act(env, call, row, persona, now, helpers);
    return;
  }
  if (Number(row.next_wake) > now) return;

  if (ctx.online >= MAX_ONLINE || !awake(persona, now) || Math.random() > WAKE_CHANCE) {
    await env.DB.prepare("UPDATE bots SET next_wake = ? WHERE user_id = ?")
      .bind(now + rand(RETRY_MS, RETRY_MS * 3), row.user_id)
      .run();
    return;
  }

  ctx.online += 1;
  const stamina = Number(persona.stamina) || 1;
  const until = now + Math.round(rand(SESSION_MIN_MS, SESSION_MAX_MS) * stamina);
  // The set is decided once, here: someone sits down to open one thing.
  row.session_set = pickSet(persona);
  await env.DB.prepare(
    "UPDATE bots SET online_until = ?, next_wake = ?, session_set = ? WHERE user_id = ?"
  )
    .bind(until, until + rand(AWAY_MIN_MS, AWAY_MAX_MS), row.session_set, row.user_id)
    .run();
  row.online_until = until;
  await act(env, call, row, persona, now, helpers);
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
    const ctx = { online: rows.filter((row) => Number(row.online_until) > now).length };
    for (const row of rows) {
      const persona = ROSTER.find((item) => item.handle === row.handle);
      if (!persona) continue;
      try {
        await step(env, call, row, persona, now, ctx, helpers);
      } catch (err) {
        console.error("bot step", row.handle, err);
      }
    }
  } catch (err) {
    console.error("tickBots", err);
  }
}
