/**
 * Local trainer accounts. No server — profiles and PINs live in this browser
 * so you can keep more than one binder on a shared machine.
 */
import { cloneSave, emptySave, importState, saveState } from "./state.js";

const REGISTRY_KEY = "poke-pack-rip-trainers-v1";
const SAVE_PREFIX = "poke-pack-rip-save-";
const GUEST_ID = "guest";

export const AVATAR_COLORS = [
  { id: "gold", hex: "#f0c14b", label: "Gold" },
  { id: "violet", hex: "#9b6dff", label: "Violet" },
  { id: "rose", hex: "#ff5fa2", label: "Rose" },
  { id: "aqua", hex: "#5fd4ff", label: "Aqua" },
  { id: "lime", hex: "#66e08a", label: "Lime" },
  { id: "ember", hex: "#ff7a3d", label: "Ember" },
];

function blankRegistry() {
  return { activeId: null, trainers: {} };
}

function readRegistry() {
  try {
    const raw = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "null");
    if (!raw || typeof raw !== "object") return blankRegistry();
    return {
      activeId: raw.activeId || null,
      trainers: raw.trainers && typeof raw.trainers === "object" ? raw.trainers : {},
    };
  } catch {
    return blankRegistry();
  }
}

function writeRegistry(reg) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

function saveSlotKey(id) {
  return `${SAVE_PREFIX}${id || GUEST_ID}`;
}

function readSlot(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(saveSlotKey(id)) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function writeSlot(id, snapshot) {
  localStorage.setItem(saveSlotKey(id), JSON.stringify(snapshot));
}

export function trainerList() {
  const { trainers } = readRegistry();
  return Object.values(trainers).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}

export function activeTrainer() {
  const reg = readRegistry();
  if (!reg.activeId) return null;
  return reg.trainers[reg.activeId] || null;
}

export function avatarColor(id) {
  return AVATAR_COLORS.find((c) => c.id === id) || AVATAR_COLORS[0];
}

export function trainerInitial(trainer) {
  const src = trainer?.name || trainer?.handle || "T";
  return src.trim().charAt(0).toUpperCase() || "T";
}

export function trainerCode(id) {
  return `PK-${String(id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "0")}`;
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16);
}

function newId() {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${time}${rand}`;
}

async function digest(text) {
  const encoded = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", encoded);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}

async function hashSecret(id, secret) {
  if (!secret) return "";
  return digest(`${id}:${secret}:poke-pack.rip`);
}

export async function verifySecret(trainer, secret) {
  if (!trainer?.pinHash) return true;
  if (!secret) return false;
  return (await hashSecret(trainer.id, secret)) === trainer.pinHash;
}

function persistLive(state, slotId) {
  writeSlot(slotId || GUEST_ID, cloneSave(state));
  saveState(state);
}

function parkCurrentSave(state) {
  const current = activeTrainer();
  persistLive(state, current?.id || GUEST_ID);
}

/**
 * Create a trainer on this device. Guest sign-up can keep the current binder;
 * adding another trainer starts a fresh save.
 */
export async function createTrainer(state, { name, handle, password, color, keepProgress = false }) {
  const display = String(name || "").trim().slice(0, 24);
  const tag = normalizeHandle(handle);
  if (display.length < 2) return { ok: false, error: "Pick a trainer name (at least 2 letters)." };
  if (tag.length < 3) return { ok: false, error: "Handle needs 3–16 letters, numbers, or underscores." };
  const reg = readRegistry();
  if (Object.values(reg.trainers).some((t) => t.handle === tag)) {
    return { ok: false, error: "That handle is already on this device." };
  }
  parkCurrentSave(state);

  const id = newId();
  const trainer = {
    id,
    name: display,
    handle: tag,
    pinHash: await hashSecret(id, String(password || "").trim()),
    color: AVATAR_COLORS.some((c) => c.id === color) ? color : "gold",
    bio: "",
    title: "Rookie",
    createdAt: Date.now(),
    lastPlayed: Date.now(),
  };
  // Flip the active slot before hydrating so auto-mirroring writes the new
  // trainer, not the one we just parked.
  reg.trainers[id] = trainer;
  reg.activeId = id;
  writeRegistry(reg);
  if (!keepProgress) importState(state, emptySave());
  persistLive(state, id);
  if (keepProgress) writeSlot(GUEST_ID, emptySave());
  return { ok: true, trainer };
}

export async function signInTrainer(state, id, password) {
  const reg = readRegistry();
  const trainer = reg.trainers[id];
  if (!trainer) return { ok: false, error: "No trainer with that handle on this device." };
  if (!(await verifySecret(trainer, password))) {
    return { ok: false, error: trainer.pinHash ? "Wrong password." : "Could not sign in." };
  }
  if (reg.activeId === id) return { ok: true, trainer };
  parkCurrentSave(state);
  const snap = readSlot(id);
  trainer.lastPlayed = Date.now();
  reg.trainers[id] = trainer;
  reg.activeId = id;
  writeRegistry(reg);
  if (!importState(state, snap || emptySave())) {
    importState(state, emptySave());
  }
  persistLive(state, id);
  return { ok: true, trainer };
}

export function signOutTrainer(state) {
  const current = activeTrainer();
  if (!current) return true;
  persistLive(state, current.id);
  const guest = readSlot(GUEST_ID);
  const reg = readRegistry();
  reg.activeId = null;
  writeRegistry(reg);
  if (!importState(state, guest || emptySave())) {
    importState(state, emptySave());
  }
  persistLive(state, GUEST_ID);
  return true;
}

export function updateTrainer(patch) {
  const reg = readRegistry();
  if (!reg.activeId || !reg.trainers[reg.activeId]) return null;
  const next = { ...reg.trainers[reg.activeId], ...patch, lastPlayed: Date.now() };
  if (patch.handle) {
    const tag = normalizeHandle(patch.handle);
    if (tag.length < 3) return null;
    if (Object.values(reg.trainers).some((t) => t.id !== next.id && t.handle === tag)) return null;
    next.handle = tag;
  }
  if (patch.name) {
    const display = String(patch.name).trim().slice(0, 24);
    if (display.length < 2) return null;
    next.name = display;
  }
  if (patch.bio != null) next.bio = String(patch.bio).slice(0, 160);
  if (patch.color && AVATAR_COLORS.some((c) => c.id === patch.color)) next.color = patch.color;
  if (patch.title) next.title = String(patch.title).slice(0, 28);
  reg.trainers[next.id] = next;
  writeRegistry(reg);
  return next;
}

export async function setTrainerPassword(password, currentPassword) {
  const reg = readRegistry();
  const trainer = reg.activeId ? reg.trainers[reg.activeId] : null;
  if (!trainer) return { ok: false, error: "Sign in first." };
  if (trainer.pinHash && !(await verifySecret(trainer, currentPassword || ""))) {
    return { ok: false, error: "Current password is wrong." };
  }
  trainer.pinHash = await hashSecret(trainer.id, String(password || "").trim());
  trainer.lastPlayed = Date.now();
  reg.trainers[trainer.id] = trainer;
  writeRegistry(reg);
  return { ok: true };
}

export function deleteTrainer(state, id) {
  const reg = readRegistry();
  if (!reg.trainers[id]) return { ok: false, error: "That trainer is not on this device." };
  const wasActive = reg.activeId === id;
  delete reg.trainers[id];
  localStorage.removeItem(saveSlotKey(id));
  if (wasActive) {
    const guest = readSlot(GUEST_ID);
    reg.activeId = null;
    writeRegistry(reg);
    importState(state, guest || emptySave());
    persistLive(state, GUEST_ID);
  } else {
    writeRegistry(reg);
  }
  return { ok: true };
}

export function persistActiveSave(state) {
  const current = activeTrainer();
  writeSlot(current?.id || GUEST_ID, cloneSave(state));
}

export function mirrorSave(state) {
  persistActiveSave(state);
}
