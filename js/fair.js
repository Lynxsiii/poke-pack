/* Provably fair rolls. Pure functions only: the Worker rolls with them and the browser's verify page checks with them,
   so a roll can be replayed by anyone who has its seeds.

   The scheme is the standard one:
     - the server picks a secret server seed and shows only its SHA-256 hash before any bet uses it;
     - the player has a client seed they can change at any time;
     - each bet uses the next nonce (0, 1, 2 ...) of that pair;
     - the numbers come from HMAC-SHA256(key = server seed, message = `${clientSeed}:${nonce}:${round}`), round 0, 1, 2 ...
       for as many 32-byte blocks as the bet needs, read four bytes at a time as big-endian unsigned integers;
     - rotating the seed pair reveals the old server seed, so every bet made with it can be checked against the hash.

   Games between players (coinflip, jackpot, pack battles) don't belong to one player's
   seed pair: each game gets its own server seed, hashed and shown from the moment it opens, and revealed when
   it ends. Its "client seed" is built from the players' own client seeds and the game id (see gameClientSeed).

   SHA-256 is written out here (and not crypto.subtle) because the pack engine draws synchronously.

   How draws become results (each is exactly uniform, the same odds as the plain crypto draws they replace):
     int(n)  a whole number in [0, n): rejection-sampled 32-bit draws (a draw at or over floor(2^32 / n) * n is skipped);
     below(n) the same for n up to 2^52, from 52-bit draws when n is over 2^32;
     unit()  a real number in [0, 1) with 52 bits: (int(2^26) * 2^26 + int(2^26)) / 2^52. */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const enc = new TextEncoder();
const bytesOf = (v) => (v instanceof Uint8Array ? v : enc.encode(String(v)));

const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Uint32Array(64);

/** One SHA-256 compression of the 64 bytes at `off` of `buf` into `h` (8 words, changed in place). */
function compress(h, buf, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
}

/** Hash `msg` starting from state `h` (already holding `prefix` bytes), finishing with padding. Returns 32 bytes. */
function finish(h, msg, prefix = 0) {
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bits = (len + prefix) * 8;
  const hi = Math.floor(bits / 4294967296);
  buf[total - 8] = hi >>> 24; buf[total - 7] = hi >>> 16; buf[total - 6] = hi >>> 8; buf[total - 5] = hi;
  buf[total - 4] = bits >>> 24; buf[total - 3] = bits >>> 16; buf[total - 2] = bits >>> 8; buf[total - 1] = bits;
  for (let off = 0; off < total; off += 64) compress(h, buf, off);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = h[i] >>> 16; out[i * 4 + 2] = h[i] >>> 8; out[i * 4 + 3] = h[i]; }
  return out;
}

/** SHA-256 of a string (UTF-8) or bytes, as 32 bytes. */
export const sha256 = (input) => finish(new Int32Array(IV), bytesOf(input));

/** An HMAC-SHA256 keyed once, so a stream of messages costs two compressions each (plus one per extra 64 bytes). */
function hmacKeyed(key) {
  let k = bytesOf(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = (k[i] || 0) ^ 0x36; opad[i] = (k[i] || 0) ^ 0x5c; }
  const inner = new Int32Array(IV), outer = new Int32Array(IV);
  compress(inner, ipad, 0);
  compress(outer, opad, 0);
  return (message) => finish(new Int32Array(outer), finish(new Int32Array(inner), bytesOf(message), 64), 64);
}

/** HMAC-SHA256(key, message), as 32 bytes. */
export const hmacSha256 = (key, message) => hmacKeyed(key)(message);

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** The hash a server seed is shown as before it is revealed. */
export const hashSeed = (serverSeed) => toHex(sha256(String(serverSeed)));

/** A new secret server seed: 32 random bytes as 64 hex characters. */
export function newServerSeed() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** A default client seed: 10 random characters a player can read and change. */
export function newClientSeed() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => abc[b & 31]).join('');
}

/** A client seed as the server keeps it: printable text, 1 to 64 characters. Null when it isn't one. */
export function cleanClientSeed(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 64 || !/^[\x21-\x7e]+$/.test(s)) return null;
  return s;
}

/**
 * The draw stream of one bet. `used()` says how many 32-bit draws were read, which the verify page shows.
 */
export function fairStream(serverSeed, clientSeed, nonce) {
  const mac = hmacKeyed(String(serverSeed));
  let round = 0;
  let block = null;
  let pos = 8;
  let count = 0;
  const next = () => {
    if (pos >= 8) {
      block = new DataView(mac(`${clientSeed}:${nonce}:${round++}`).buffer);
      pos = 0;
    }
    count++;
    return block.getUint32(4 * pos++);
  };
  const int = (n) => {
    n = Math.floor(n);
    if (!(n >= 1) || n > 4294967296) throw new Error('fairStream.int needs 1 <= n <= 2^32');
    if (n === 1) return 0;
    const limit = Math.floor(4294967296 / n) * n;
    // Tests rig draws through globalThis.__fairRig(n) (a raw 32-bit draw, or undefined for a real one). Nothing in the
    // site or the Worker sets it.
    const rig = globalThis.__fairRig;
    for (;;) {
      let v = rig ? rig(n) : undefined;
      if (v === undefined) v = next();
      else { count++; v >>>= 0; }
      if (v < limit) return v % n;
    }
  };
  const unit = () => (int(2 ** 26) * 2 ** 26 + int(2 ** 26)) / 2 ** 52;
  // A whole number in [0, n) for any n up to 2^52 (a jackpot's cents can pass 2^32): int(n) when it fits in 32 bits,
  // else rejection-sampled 52-bit draws.
  const below = (n) => {
    n = Math.floor(n);
    if (n <= 4294967296) return int(n);
    if (n > 2 ** 52) throw new Error('fairStream.below needs n <= 2^52');
    const limit = Math.floor(2 ** 52 / n) * n;
    for (;;) {
      const v = int(2 ** 26) * 2 ** 26 + int(2 ** 26);
      if (v < limit) return v % n;
    }
  };
  return { int, unit, below, raw: next, used: () => count };
}

/** The client seed of a game between players: the game's id, then each seat's client seed in seat order. */
export const gameClientSeed = (gameId, seeds = []) => [String(gameId), ...seeds.map((s) => String(s ?? ''))].join('|');

// ---- What each game makes of its stream ---------------------------------------------------------------------------
/* These are the exact functions the Worker uses, so the verify page gets the same answer from the same seeds. */

/** Coinflip: one draw, int(2). 0 = host's side wins, 1 = guest's. */
export const flipWinner = (s) => (s.int(2) === 0 ? 'host' : 'guest');

/** Jackpot: one ticket in [0, total cents); the seat whose run of cents holds it wins. */
export const jackpotTicket = (s, totalCents) => s.below(totalCents);

/** Jackpot: the seat holding `ticket`, walking the seats in seat order (`seats` is [{ seat, value }]). */
export function jackpotSeat(seats, ticket) {
  const order = [...seats].sort((a, b) => a.seat - b.seat);
  let left = ticket;
  for (const e of order) {
    if (left < e.value) return e.seat;
    left -= e.value;
  }
  return order[order.length - 1].seat;
}

/** Upgrader: a roll in [0, 1,000,000); the upgrade wins when roll < chance (millionths). */
export const upgradeRoll = (s) => s.int(1_000_000);

/** Tall Grass: the Voltorb tiles, a Fisher-Yates shuffle of 0..tiles-1, first `mines`, sorted. */
export function grassBoard(s, tiles, mines) {
  const order = [...Array(tiles).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = s.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, mines).sort((a, b) => a - b);
}

/** Mystery Tins: for each tin opened in one go, a unit draw walked down the tin's odds list. Returns indexes. */
export function tinPicks(s, odds, count) {
  const out = [];
  for (let t = 0; t < count; t++) {
    let u = s.unit();
    let pick = odds.length - 1;
    for (let i = 0; i < odds.length; i++) {
      if (u < odds[i]) { pick = i; break; }
      u -= odds[i];
    }
    out.push(pick);
  }
  return out;
}

/** Rayquaza: one unit draw per round; the game's rocketCrash(u) turns it into the multiplier. */
export const rocketUnit = (s) => s.unit();
