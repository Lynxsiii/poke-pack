// Phone tilt never jumps: node scripts/test-phone-tilt.mjs
// Simulates a phone being turned smoothly in the poses where deviceorientation's angles wrap (upright, overhead, on
// its side) and checks that the lean the card light follows moves smoothly too. Before 2026-11-25 the light was
// driven by beta and gamma directly and leapt across the card at each wrap.
import assert from "node:assert/strict";
import { orientationQuat, quatToward, leanFrom } from "../js/card-motion.js";

const RAD = Math.PI / 180;
const mul = (a, b) => a.map((_, i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));
const rx = (d) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const ry = (d) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rz = (d) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
/** What the browser reports for a rotation matrix (the W3C DeviceOrientation spec's own extraction). */
function euler(m) {
  let alpha, beta, gamma;
  if (m[2][2] > 0) { alpha = Math.atan2(-m[0][1], m[1][1]); beta = Math.asin(m[2][1]); gamma = Math.atan2(-m[2][0], m[2][2]); }
  else if (m[2][2] < 0) {
    alpha = Math.atan2(m[0][1], -m[1][1]); beta = -Math.asin(m[2][1]); beta += beta >= 0 ? -Math.PI : Math.PI;
    gamma = Math.atan2(m[2][0], -m[2][2]);
  } else { alpha = Math.atan2(m[1][0], m[0][0]); beta = m[2][1] > 0 ? Math.PI / 2 : -Math.PI / 2; gamma = 0; }
  if (alpha < 0) alpha += 2 * Math.PI;
  return [alpha / RAD, beta / RAD, gamma / RAD];
}
/** A hold (matrix) wobbled about the phone's own axes: 60 events a second for four seconds. */
function* wobble(hold, ampX, ampY) {
  for (let i = 0; i < 240; i++) {
    const t = i / 60;
    yield euler(mul(mul(hold, rx(ampX * Math.sin(t * 2.1))), ry(ampY * Math.sin(t * 1.3 + .4))));
  }
}
const HOLDS = {
  "in the hand (beta 45)": rx(45),
  "upright (beta 88)": rx(88),
  "past upright (beta 100)": rx(100),
  "overhead, lying down (beta 170)": rx(170),
  "on its side (gamma 80)": mul(rx(30), ry(80)),
  "turned round and upright": mul(rz(200), rx(92)),
};
let wrapsSeen = 0;
for (const [name, hold] of Object.entries(HOLDS)) {
  let level = null, last = null, lastRaw = null, worst = 0, worstRaw = 0;
  for (const [alpha, beta, gamma] of wobble(hold, 14, 18)) {
    const q = orientationQuat(alpha, beta, gamma);
    level = level ? quatToward(level, q, 1 - Math.exp(-(1 / 60) / 4)) : q;
    const lean = leanFrom(level, q);
    if (last) worst = Math.max(worst, Math.abs(lean.x - last.x), Math.abs(lean.y - last.y));
    if (lastRaw) worstRaw = Math.max(worstRaw, Math.abs(beta - lastRaw[0]), Math.abs(gamma - lastRaw[1]));
    last = lean; lastRaw = [beta, gamma];
  }
  if (worstRaw > 20) wrapsSeen += 1;
  console.log(`${name.padEnd(34)} raw angles jump up to ${worstRaw.toFixed(1)} deg an event, the lean ${worst.toFixed(2)} deg`);
  assert.ok(worst < 1.5, `${name}: the lean jumped ${worst.toFixed(1)} degrees between two events`);
}
assert.ok(wrapsSeen >= 2, "the simulation should cover poses where the raw angles wrap");
// In the hand the lean is the old reading: a turn of g degrees about the long axis is x = g, about the short one y = b.
{
  const level = orientationQuat(10, 45, 0);
  const a = leanFrom(level, orientationQuat(10, 45, 8)), b = leanFrom(level, orientationQuat(10, 51, 0));
  assert.ok(Math.abs(a.x - 8) < .05 && Math.abs(a.y) < .05, `gamma +8 reads ${JSON.stringify(a)}`);
  assert.ok(Math.abs(b.y - 6) < .05 && Math.abs(b.x) < .05, `beta +6 reads ${JSON.stringify(b)}`);
}
console.log("phone tilt: ok");
