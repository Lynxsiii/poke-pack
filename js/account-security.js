/**
 * Account > Security (design: css/pages/account-security.css, spec in
 * /mnt/project-files/account-security/design/spec.md). A checklist of rows that
 * open in place: password, two-step sign-in, recovery code, devices with the
 * sign-in history, Discord, and Delete account last. Also the sign-in page's
 * two-step code step and the Discord return from /account/discord.
 *
 * The server side is worker/security.js. Email rows stay out until the site
 * has a mail sender (Noah chose "no email for now", 2026-11-28).
 *
 * app.js calls initSecurity(deps) once, securityTabHtml(trainer) when it draws
 * the tab, and twoStepAuthHtml() / startTwoStep() for the sign-in step.
 */

import { qrSvg } from "./qr.js?v=1";

const DISCORD_APP_ID = "1556002527818948771";
const VERIFIER_KEY = "pp-discord-verifier";
const STATE_KEY = "pp-discord-state";

const DISCORD_SVG = `<svg class="sec-discord-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`;
const ICON_PHONE = `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="miter" aria-hidden="true"><rect x="7" y="2.5" width="12" height="21"/><path d="M11.5 19.5h3" stroke-linecap="square"/></svg>`;
const ICON_DESK = `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="miter" stroke-linecap="square" aria-hidden="true"><rect x="2.5" y="4" width="21" height="14"/><path d="M9 22.5h8M13 18v4.5"/></svg>`;

const PASS_FIELD = (label, name = "current", auto = "current-password") =>
  `<label class="field"><span>${label}</span><span class="field-pass"><input name="${name}" type="password" maxlength="64" required autocomplete="${auto}" /><button class="pass-show" type="button" data-pass-show aria-pressed="false">Show</button></span></label>`;
const CODE_FIELD = (label) =>
  `<label class="field">${label ? `<span>${label}</span>` : ""}<input class="sec-code-input" name="code"${label ? "" : ' aria-label="6-digit code"'} inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required placeholder="000000" /></label>`;

let deps = null;
/** What the server said (GET /api/me/security), plus what's open and which sub-step each row is on. */
const sec = {
  loaded: false,
  loading: false,
  data: null,
  open: "",
  totpSetup: null, // { secret, uri } while turning two-step on
  totpOff: "", // "", "code" or "password"
  historyAll: false,
};
/** The sign-in page's second step: { ticket, handle, mode: "code" | "recovery" }. */
let twoStep = null;

/* ---- helpers ------------------------------------------------------------ */

const esc = (v) => deps.esc(v);

function shortDate(ms, year = false) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 300) return `<span class="is-now">active now</span>`;
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return unit(Math.round(s / 60), "minute");
  if (s < 86400) return unit(Math.round(s / 3600), "hour");
  if (s < 86400 * 14) return unit(Math.round(s / 86400), "day");
  return unit(Math.round(s / (86400 * 7)), "week");
}

function visitTime(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${shortDate(ms)}, ${time}`;
}

/** "iPhone · Safari" from the server reads "Safari on iPhone" on screen. */
function deviceName(label) {
  const [os, browser] = String(label || "").split(" · ");
  if (!browser) return os || "Unknown device";
  return `${browser} on ${os}`;
}

const isPhone = (label) => /iPhone|iPad|Android/.test(label || "");

function thisKind(label) {
  if (/iPhone/.test(label)) return "This iPhone";
  if (/iPad/.test(label)) return "This iPad";
  if (/Android/.test(label)) return "This phone";
  return "This computer";
}

function groups(code) {
  return String(code || "")
    .replace(/[\s-]/g, "")
    .match(/.{1,4}/g)
    ?.map((g) => `<span>${esc(g)}</span>`)
    .join("") || "";
}

function rerender() {
  if (deps.onSecurityTab()) deps.rerender();
}

async function load() {
  if (sec.loading) return;
  sec.loading = true;
  try {
    sec.data = await deps.api("/api/me/security");
  } catch {
    sec.data = sec.data || null;
  }
  sec.loaded = true;
  sec.loading = false;
  rerender();
}

/** Forget everything on sign-out or a switch of account. */
export function resetSecurity() {
  sec.loaded = false;
  sec.data = null;
  sec.open = "";
  sec.totpSetup = null;
  sec.totpOff = "";
  sec.historyAll = false;
}

function wrong(form, message, errorId) {
  const err = form.querySelector(`#${errorId}`);
  if (err) err.textContent = message;
  const input = form.querySelector(".sec-code-input");
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.classList.remove("is-wrong");
    void input.offsetWidth;
    input.classList.add("is-wrong");
    input.select?.();
  }
}

/* ---- rows ----------------------------------------------------------------- */

function item(id, { name, status, state, mark, panel, danger = false }) {
  const open = sec.open === id;
  return `<div class="sec-item${open ? " is-open" : ""}" data-sec="${id}" data-state="${state}">
    <button class="sec-row" type="button" data-sec-open="${id}" aria-expanded="${open}" aria-controls="sec-panel-${id}">
      ${mark}
      <span class="sec-row-text"><span class="sec-row-name">${name}</span><span class="sec-row-status">${status}</span></span>
      <i class="sec-row-arrow" aria-hidden="true"></i>
    </button>
    <div class="sec-panel" id="sec-panel-${id}"${open ? "" : " hidden"}>${panel}</div>
  </div>`;
}

const ball = (on) => `<i class="sec-row-mark rt-ball${on ? "" : " e"}" aria-hidden="true"></i>`;

function passwordItem() {
  const changed = (sec.data?.history || []).find((h) => h.kind === "password" || h.kind === "reset" || h.kind === "recover");
  return item("password", {
    name: "Password",
    status: changed ? `Changed ${shortDate(changed.at)}` : "Set when you joined",
    state: "on",
    mark: ball(true),
    panel: `<form id="password-form" class="sec-form" novalidate>
      ${PASS_FIELD("Current password")}
      <label class="field"><span>New password</span><span class="field-pass"><input name="password" type="password" minlength="6" maxlength="64" required autocomplete="new-password" /><button class="pass-show" type="button" data-pass-show aria-pressed="false">Show</button></span><span class="hint">At least 6 characters.</span></label>
      <p class="sec-note">This signs you out on your other devices.</p>
      <p class="form-error" id="password-error" role="alert"></p>
      <div class="sec-actions"><button class="solid" type="submit">Update password</button></div>
    </form>`,
  });
}

function totpItem(recovery) {
  const on = sec.data?.totp;
  let panel;
  if (!sec.data) {
    panel = `<p class="sec-note">Checking.</p>`;
  } else if (on && sec.totpOff) {
    const byCode = sec.totpOff === "code";
    panel = `<div class="sec-value"><b>On</b><span>Authenticator app, since ${shortDate(on.since, true)}</span></div>
      <form id="sec-totp-off-form" class="sec-form" data-mode="${sec.totpOff}" novalidate>
        ${byCode ? CODE_FIELD("Enter a code from your app to turn it off") : PASS_FIELD("Your password")}
        <p class="form-error" id="sec-totp-off-error" role="alert"></p>
        <div class="sec-actions">
          <button class="ghost danger-btn" type="submit">Turn off two-step</button>
          <button class="text-btn" type="button" data-sec-totp-off-mode="${byCode ? "password" : "code"}">${byCode ? "Use your password instead" : "Use a code instead"}</button>
          <button class="text-btn" type="button" data-sec-totp-keep>Keep it on</button>
        </div>
      </form>`;
  } else if (on) {
    panel = `<div class="sec-value"><b>On</b><span>Authenticator app, since ${shortDate(on.since, true)}</span></div>
      ${
        recovery.loaded && !recovery.createdAt && !recovery.code
          ? `<p class="sec-note"><b>Make a recovery code next.</b> Without one, a lost phone locks you out.</p>`
          : `<p class="sec-note">You'll be asked for a code each time you sign in. If you lose your phone, your recovery code gets you back in.</p>`
      }
      <div class="sec-actions"><button class="ghost sm" type="button" data-sec-totp-off>Turn off</button></div>`;
  } else if (sec.totpSetup) {
    let qr = "";
    try {
      qr = qrSvg(sec.totpSetup.uri, { label: "QR code for your authenticator app" });
    } catch {
      qr = "";
    }
    panel = `<ol class="sec-steps">
      <li class="sec-step">
        <p class="sec-step-h"><i class="rt-ball" aria-hidden="true"></i><span>Scan this in your authenticator app</span></p>
        ${qr ? `<div class="sec-qr" id="sec-totp-qr">${qr}</div>` : ""}
        <p class="sec-note">${qr ? "Can't scan it? Type this key into the app instead." : "Type this key into your authenticator app."}</p>
        <div class="sec-key">
          <p class="sec-key-value" id="sec-totp-secret">${groups(sec.totpSetup.secret)}</p>
          <button class="ghost sm" type="button" data-sec-totp-copy>Copy</button>
        </div>
      </li>
      <li class="sec-step">
        <p class="sec-step-h"><i class="rt-ball e now" aria-hidden="true"></i><span>Enter the code it shows</span></p>
        <form id="sec-totp-form" class="sec-form" novalidate>
          ${CODE_FIELD("")}
          <p class="form-error" id="sec-totp-error" role="alert"></p>
          <div class="sec-actions"><button class="solid" type="submit">Turn on two-step</button><button class="text-btn" type="button" data-sec-totp-cancel>Cancel</button></div>
        </form>
      </li>
    </ol>`;
  } else {
    panel = `<p class="sec-note">A second lock on your account. After your password you'll enter a 6-digit code from an authenticator app, like Google Authenticator, 1Password or Authy.</p>
      <div class="sec-actions"><button class="solid" type="button" data-sec-totp-start>Turn on</button></div>`;
  }
  return item("totp", {
    name: "Two-step sign-in",
    status: on ? "On, with an authenticator app" : "Off",
    state: on ? "on" : "off",
    mark: ball(Boolean(on)),
    panel,
  });
}

function recoveryItem(recovery) {
  let panel;
  let status;
  if (!recovery.loaded) {
    deps.loadRecovery();
    status = "Checking";
    panel = `<p class="sec-note">Checking for a recovery code.</p>`;
  } else if (recovery.code) {
    status = `Made ${shortDate(recovery.createdAt || Date.now())}`;
    panel = `<div class="sec-key">
        <p class="sec-key-value" id="recovery-value">${groups(recovery.code)}</p>
        <button class="ghost sm" type="button" data-copy-recovery>Copy</button>
      </div>
      <p class="sec-note"><b>Save it now.</b> Put it in your notes or a password manager. It won't be shown again.</p>`;
  } else if (recovery.createdAt) {
    status = `Made ${shortDate(recovery.createdAt)}`;
    panel = `<p class="sec-note">You made one on ${shortDate(recovery.createdAt, true)}. It's only shown once, so if you've lost it, make a new one. A new one replaces it.</p>
      <div class="sec-actions"><button class="ghost" type="button" data-make-recovery>Make a new code</button></div>`;
  } else {
    status = "None yet";
    panel = `<p class="sec-note">One code that sets a new password if you forget yours. Keep it somewhere safe, like your notes or a password manager.</p>
      <div class="sec-actions"><button class="ghost" type="button" data-make-recovery>Make a recovery code</button></div>`;
  }
  const on = Boolean(recovery.code || recovery.createdAt);
  return item("recovery", { name: "Recovery code", status, state: on ? "on" : "off", mark: ball(on), panel });
}

function devicesItem() {
  const devices = sec.data?.devices || [];
  const current = devices.find((d) => d.current);
  const others = devices.length - (current ? 1 : 0);
  const status = !sec.data
    ? "Checking"
    : others
      ? `${current ? thisKind(current.device) : "This device"} and ${others} other${others === 1 ? "" : "s"}`
      : "Just this one";
  let panel;
  if (!sec.data) {
    panel = `<p class="sec-note">Checking your devices.</p>`;
  } else {
    const ordered = [...devices].sort((a, b) => Number(b.current) - Number(a.current));
    const list = ordered
      .map(
        (d) => `<li class="sec-device">
        <span class="sec-device-icon">${isPhone(d.device) ? ICON_PHONE : ICON_DESK}</span>
        <span class="sec-device-text">
          <span class="sec-device-name">${esc(deviceName(d.device))}${d.current ? ` <span class="sec-tag">This device</span>` : ""}</span>
          <span class="sec-device-meta">${d.place ? `${esc(d.place)}, ` : ""}${d.current ? `<span class="is-now">active now</span>` : ago(d.seen)}</span>
        </span>
        ${d.current ? "" : `<button class="ghost sm" type="button" data-sec-device-out="${esc(d.id)}">Sign out</button>`}
      </li>`
      )
      .join("");
    const history = sec.data.history || [];
    const shown = sec.historyAll ? history : history.slice(0, 5);
    const visits = shown
      .map((h) => {
        const failed = { signin_failed: "Wrong password", code_failed: "Wrong two-step code" }[h.kind];
        const what = {
          signin: "Signed in",
          signup: "Joined",
          password: "Password changed",
          reset: "Password reset",
          recover: "Reset with a recovery code",
          totp_on: "Two-step turned on",
          totp_off: "Two-step turned off",
          discord_linked: "Discord linked",
          discord_unlinked: "Discord unlinked",
          signout_all: "Signed out everywhere else",
          email_added: "Email added",
          email_removed: "Email removed",
        }[h.kind];
        const lead = failed ? `<b>${failed}</b>, ` : what && h.kind !== "signin" ? `${what}, ` : "";
        return `<li class="sec-visit${failed ? " is-failed" : ""}"><time class="sec-visit-time" datetime="${new Date(h.at).toISOString()}">${visitTime(h.at)}</time><span class="sec-visit-what">${lead}${esc(deviceName(h.device))}${h.place ? `<small>${esc(h.place)}</small>` : ""}</span></li>`;
      })
      .join("");
    panel = `<ul class="sec-devices">${list}</ul>
      ${others ? `<div class="sec-actions"><button class="ghost" type="button" data-sec-devices-out-all>Sign out everywhere else</button></div>` : ""}
      <h3 class="sec-history-h">Recent sign-ins</h3>
      ${history.length ? `<ol class="sec-history">${visits}</ol>` : `<p class="sec-note">No sign-ins on record yet.</p>`}
      ${history.length > 5 && !sec.historyAll ? `<div class="sec-actions"><button class="text-btn" type="button" data-sec-history-more>Show more</button></div>` : ""}
      <p class="sec-note">Places are a rough guess from the network. If something here isn't you, change your password.</p>`;
  }
  return item("devices", {
    name: "Devices",
    status,
    state: "on",
    mark: `<span class="sec-row-mark is-count" aria-hidden="true">${sec.data ? devices.length || 1 : ""}</span>`,
    panel,
  });
}

function discordItem() {
  const d = sec.data?.discord;
  let panel;
  if (!sec.data) {
    panel = `<p class="sec-note">Checking.</p>`;
  } else if (d) {
    panel = `<div class="sec-discord">
        <span class="sec-discord-face">${d.avatar ? `<img src="${esc(d.avatar)}" alt="" width="48" height="48" />` : DISCORD_SVG}</span>
        <div class="sec-value"><b>@${esc(d.username)}</b><span>Linked ${shortDate(d.linkedAt, true)}. Big pulls in the server can mention you.</span></div>
      </div>
      <label class="toggle-row sec-switch">
        <span><b>Show on my profile</b><small>Your Discord name sits under your handle.</small></span>
        <input type="checkbox" name="discordPublic" data-sec-discord-show${d.shown ? " checked" : ""} />
        <span class="switch" aria-hidden="true"></span>
      </label>
      <div class="sec-actions"><button class="text-btn" type="button" data-sec-discord-unlink>Unlink Discord</button></div>`;
  } else if (!sec.data.discordReady) {
    panel = `<p class="sec-note">Discord linking is almost ready. Check back soon.</p>`;
  } else {
    panel = `<p class="sec-note">Link your Discord and big pulls posted in the server can mention you. You can also show it on your profile, if you like. We only see your Discord name and picture.</p>
      <div class="sec-actions"><button class="ghost" type="button" data-sec-discord-link>${DISCORD_SVG} Link Discord</button></div>`;
  }
  return item("discord", {
    name: "Discord",
    status: d ? `Linked as <b>@${esc(d.username)}</b>` : "Not linked",
    state: d ? "on" : "off",
    mark: `<span class="sec-row-mark${d ? "" : " is-off"}" aria-hidden="true">${DISCORD_SVG}</span>`,
    panel,
  });
}

function deleteItem(trainer) {
  return item("delete", {
    name: "Delete account",
    status: "Removes everything. There's no undo.",
    state: "off",
    mark: `<span class="sec-row-mark" aria-hidden="true"></span>`,
    panel: `<p class="sec-note">Removes @${esc(trainer.handle)}, every card, every badge, the binder, and your chat messages, DMs and comments. There's no undo.</p>
      <div class="sec-actions"><button class="ghost danger-btn" type="button" id="delete-trainer">Delete ${esc(trainer.name)}</button></div>`,
  });
}

/** The whole tab. Email isn't counted while the site has no mail sender. */
export function securityTabHtml(trainer) {
  if (!sec.loaded) load();
  const recovery = deps.getRecovery();
  const parts = [
    ["password", true],
    ["recovery", Boolean(recovery.code || recovery.createdAt)],
    ["totp", Boolean(sec.data?.totp)],
  ];
  const done = parts.filter(([, ok]) => ok).length;
  const next = !parts[1][1]
    ? `Next: <b>make a recovery code</b>, so a forgotten password isn't the end.`
    : !parts[2][1]
      ? `Next: <b>turn on two-step sign-in</b> for a second lock.`
      : `All three are in place. Your account is well looked after.`;
  return `<div class="sec">
    <header class="sec-head">
      <h2>Account safety</h2>
      <div class="sec-meter">
        <div class="rt-hp" role="img" aria-label="${done} of ${parts.length} set up"><em>${done} of ${parts.length}</em><div class="rt-track"><i style="--fill:${(done / parts.length).toFixed(3)}"></i></div></div>
        <p class="sec-meter-next">${next}</p>
      </div>
    </header>
    <section class="sec-group" aria-labelledby="sec-h-signin">
      <h2 class="sec-group-h" id="sec-h-signin">Sign-in and recovery</h2>
      <div class="sec-list">${passwordItem()}${totpItem(recovery)}${recoveryItem(recovery)}</div>
    </section>
    <section class="sec-group" aria-labelledby="sec-h-devices">
      <h2 class="sec-group-h" id="sec-h-devices">Devices and Discord</h2>
      <div class="sec-list">${devicesItem()}${discordItem()}</div>
    </section>
    <section class="sec-group sec-danger" aria-label="Delete account">
      <div class="sec-list">${deleteItem(trainer)}</div>
    </section>
  </div>`;
}

/** Open a row by id (e.g. after making a recovery code), redrawing the tab. */
export function openSecurityRow(id) {
  sec.open = id;
  rerender();
}

function toggleRow(id) {
  const root = document.querySelector("#view-account .sec");
  if (!root) return;
  const was = sec.open;
  sec.open = was === id ? "" : id;
  if (id === "totp" && was === id) sec.totpOff = "";
  for (const el of root.querySelectorAll(".sec-item")) {
    const open = el.dataset.sec === sec.open;
    el.classList.toggle("is-open", open);
    el.querySelector(".sec-row")?.setAttribute("aria-expanded", String(open));
    const panel = el.querySelector(".sec-panel");
    if (!panel) continue;
    panel.hidden = !open;
    if (open) {
      panel.classList.add("sec-in");
      panel.addEventListener("animationend", () => panel.classList.remove("sec-in"), { once: true });
    }
  }
}

/* ---- Discord -------------------------------------------------------------- */

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function startDiscord() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    deps.toast("Your browser blocked the link. Allow site storage and try again.");
    return;
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: DISCORD_APP_ID,
    scope: "identify",
    redirect_uri: `${location.origin}/account/discord`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  location.assign(`https://discord.com/oauth2/authorize?${params}`);
}

/** Back from Discord at /account/discord?code=…&state=…: finish the link, then tidy the address. */
export async function finishDiscordReturn() {
  if (location.pathname.replace(/\/$/, "") !== "/account/discord") return false;
  const params = new URLSearchParams(location.search);
  let verifier = "";
  let state = "";
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY) || "";
    state = sessionStorage.getItem(STATE_KEY) || "";
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* storage blocked: the check below fails and says so */
  }
  history.replaceState(history.state, "", "/account/security");
  sec.open = "discord";
  const code = params.get("code");
  if (!code || !state || params.get("state") !== state) {
    deps.toast("Discord didn't link. Try again.");
    rerender();
    return true;
  }
  try {
    const res = await deps.api("/api/me/security/discord", { method: "POST", body: JSON.stringify({ code, verifier }) });
    if (sec.data) sec.data.discord = res.discord;
    deps.toast("Discord linked.");
  } catch (err) {
    deps.toast(err.message || "Discord didn't link. Try again.");
  }
  sec.loaded = false;
  rerender();
  return true;
}

/* ---- the sign-in page's second step --------------------------------------- */

export function startTwoStep(ticket, handle) {
  twoStep = { ticket, handle, mode: "code" };
}

export function inTwoStep() {
  return Boolean(twoStep);
}

export function endTwoStep() {
  twoStep = null;
}

export function twoStepAuthHtml() {
  const code = twoStep.mode === "code";
  return `<div class="auth-card rt-box">
    <form id="signin-totp-form" class="auth-form sec-auth" data-mode="${twoStep.mode}" novalidate>
      ${
        code
          ? `<label class="field"><span>Enter the 6-digit code from your authenticator app</span><input class="sec-code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required placeholder="000000" /></label>`
          : `<label class="field"><span>Recovery code</span><input name="recovery" required maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" /><span class="hint">The one you saved from Account, Security. It's used up once you're in, so make a new one after.</span></label>`
      }
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid rt-go" type="submit">Sign in</button>
      <div class="sec-auth-links">
        <button class="text-btn" type="button" data-auth-totp-mode="${code ? "recovery" : "code"}">${code ? "Use a recovery code instead" : "Use the authenticator app instead"}</button>
        <button class="text-btn" type="button" data-auth-tab="signin">Back to sign in</button>
      </div>
    </form>
  </div>`;
}

export function twoStepHandle() {
  return twoStep?.handle || "";
}

async function submitTwoStep(form) {
  const data = new FormData(form);
  const body = { ticket: twoStep.ticket };
  if (twoStep.mode === "code") body.code = String(data.get("code") || "").replace(/\D/g, "");
  else body.recovery = String(data.get("recovery") || "");
  const btn = form.querySelector("[type=submit]");
  if (btn) btn.disabled = true;
  try {
    const result = await deps.api("/api/auth/signin/code", { method: "POST", body: JSON.stringify(body) });
    twoStep = null;
    await deps.onSignedIn(result);
    if (result.usedRecovery) deps.toast("That recovery code is used up. Make a new one in Account, Security.");
  } catch (err) {
    if (btn) btn.disabled = false;
    if (err.payload?.restart) {
      twoStep = null;
      deps.toast(err.payload.error === "Too many tries. Wait a few minutes and try again." ? err.payload.error : "That took a while. Sign in again.");
      deps.backToSignin();
      return;
    }
    wrong(
      form,
      twoStep.mode === "code" ? "That code didn't match. Wait for a new one and try again." : "That recovery code isn't right. Check it and try again.",
      "auth-error"
    );
  }
}

/* ---- events --------------------------------------------------------------- */

async function onClick(e) {
  const t = e.target;
  if (t.closest("#view-auth")) {
    const mode = t.closest("[data-auth-totp-mode]");
    if (mode && twoStep) {
      twoStep.mode = mode.dataset.authTotpMode === "recovery" ? "recovery" : "code";
      deps.renderAuth();
      document.querySelector("#signin-totp-form input")?.focus({ preventScroll: true });
    }
    return;
  }
  const root = t.closest("#view-account .sec");
  if (!root) return;
  const open = t.closest("[data-sec-open]");
  if (open) {
    toggleRow(open.dataset.secOpen);
    return;
  }
  if (t.closest("[data-sec-totp-start]")) {
    const btn = t.closest("button");
    btn.disabled = true;
    try {
      sec.totpSetup = await deps.api("/api/me/security/totp/start", { method: "POST", body: "{}" });
      sec.open = "totp";
      rerender();
      document.querySelector("#sec-totp-form .sec-code-input")?.focus({ preventScroll: true });
    } catch (err) {
      btn.disabled = false;
      deps.toast(err.message || "Couldn't start two-step. Try again.");
    }
    return;
  }
  if (t.closest("[data-sec-totp-cancel]")) {
    sec.totpSetup = null;
    rerender();
    return;
  }
  if (t.closest("[data-sec-totp-copy]")) {
    try {
      await navigator.clipboard.writeText(sec.totpSetup?.secret || "");
      deps.toast("Key copied.");
    } catch {
      const el = document.getElementById("sec-totp-secret");
      if (el) getSelection()?.selectAllChildren(el);
      deps.toast("Select the key and copy it.");
    }
    return;
  }
  if (t.closest("[data-sec-totp-off]")) {
    sec.totpOff = "code";
    rerender();
    document.querySelector("#sec-totp-off-form input")?.focus({ preventScroll: true });
    return;
  }
  const offMode = t.closest("[data-sec-totp-off-mode]");
  if (offMode) {
    sec.totpOff = offMode.dataset.secTotpOffMode === "password" ? "password" : "code";
    rerender();
    document.querySelector("#sec-totp-off-form input")?.focus({ preventScroll: true });
    return;
  }
  if (t.closest("[data-sec-totp-keep]")) {
    sec.totpOff = "";
    rerender();
    return;
  }
  const out = t.closest("[data-sec-device-out]");
  if (out) {
    out.disabled = true;
    try {
      const res = await deps.api("/api/me/security/signout", { method: "POST", body: JSON.stringify({ id: out.dataset.secDeviceOut }) });
      if (sec.data) sec.data.devices = res.devices;
      deps.toast("Signed out on that device.");
      rerender();
    } catch (err) {
      out.disabled = false;
      deps.toast(err.message || "Couldn't sign that device out.");
    }
    return;
  }
  if (t.closest("[data-sec-devices-out-all]")) {
    const btn = t.closest("button");
    btn.disabled = true;
    try {
      const res = await deps.api("/api/me/security/signout", { method: "POST", body: JSON.stringify({ all: true }) });
      if (sec.data) sec.data.devices = res.devices;
      deps.toast("Signed out everywhere else.");
      sec.loaded = false;
      rerender();
    } catch (err) {
      btn.disabled = false;
      deps.toast(err.message || "Couldn't sign the other devices out.");
    }
    return;
  }
  if (t.closest("[data-sec-history-more]")) {
    sec.historyAll = true;
    rerender();
    return;
  }
  if (t.closest("[data-sec-discord-link]")) {
    startDiscord();
    return;
  }
  if (t.closest("[data-sec-discord-unlink]")) {
    const btn = t.closest("button");
    btn.disabled = true;
    try {
      await deps.api("/api/me/security/discord", { method: "DELETE", body: "{}" });
      if (sec.data) sec.data.discord = null;
      deps.toast("Discord unlinked.");
      rerender();
    } catch (err) {
      btn.disabled = false;
      deps.toast(err.message || "Couldn't unlink Discord.");
    }
  }
}

async function onChange(e) {
  const box = e.target.closest?.("#view-account [data-sec-discord-show]");
  if (!box) return;
  try {
    await deps.api("/api/me/security/discord", { method: "PATCH", body: JSON.stringify({ shown: box.checked }) });
    if (sec.data?.discord) sec.data.discord.shown = box.checked;
    deps.toast(box.checked ? "Showing on your profile." : "Hidden from your profile.");
  } catch (err) {
    box.checked = !box.checked;
    deps.toast(err.message || "Couldn't save that.");
  }
}

function onInput(e) {
  const input = e.target.closest?.(".sec-code-input");
  if (!input) return;
  const digits = input.value.replace(/\D/g, "").slice(0, 6);
  if (digits !== input.value) input.value = digits;
  input.removeAttribute("aria-invalid");
  // The sixth digit sends the sign-in step on its own; the key stays for people who paste.
  if (digits.length === 6 && input.closest("#signin-totp-form, #sec-totp-form")) input.form?.requestSubmit?.();
}

async function onSubmit(e) {
  const form = e.target;
  if (form.id === "signin-totp-form") {
    e.preventDefault();
    if (twoStep) submitTwoStep(form);
    return;
  }
  if (form.id === "sec-totp-form") {
    e.preventDefault();
    const code = String(new FormData(form).get("code") || "");
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const res = await deps.api("/api/me/security/totp/confirm", { method: "POST", body: JSON.stringify({ code }) });
      sec.totpSetup = null;
      if (sec.data) sec.data.totp = res.totp;
      deps.toast("Two-step sign-in is on.");
      const recovery = deps.getRecovery();
      sec.open = recovery.loaded && !recovery.createdAt && !recovery.code ? "recovery" : "totp";
      sec.loaded = false;
      rerender();
    } catch (err) {
      btn.disabled = false;
      wrong(form, err.status === 429 ? err.message : "That code didn't match. Wait for a new one and try again.", "sec-totp-error");
    }
    return;
  }
  if (form.id === "sec-totp-off-form") {
    e.preventDefault();
    const data = new FormData(form);
    const body = form.dataset.mode === "password" ? { password: String(data.get("current") || "") } : { code: String(data.get("code") || "") };
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await deps.api("/api/me/security/totp", { method: "DELETE", body: JSON.stringify(body) });
      if (sec.data) sec.data.totp = null;
      sec.totpOff = "";
      deps.toast("Two-step sign-in is off.");
      sec.loaded = false;
      rerender();
    } catch (err) {
      btn.disabled = false;
      wrong(
        form,
        err.status === 429 ? err.message : body.password != null ? "That password isn't right. Try again." : "That code didn't match. Wait for a new one and try again.",
        "sec-totp-off-error"
      );
    }
  }
}

export function initSecurity(options) {
  deps = options;
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("submit", onSubmit);
}

/** After the password form saves: the history and devices changed, so ask again. */
export function securityChanged() {
  sec.loaded = false;
}
