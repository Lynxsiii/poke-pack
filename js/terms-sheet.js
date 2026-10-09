/**
 * The age question and the Terms box, on the signup form and on the one-time
 * sheet for accounts made before the Terms existed. The Worker decides
 * (worker/terms.js); this only asks.
 *
 * The age question is neutral, as COPPA guidance asks: month and year, nothing
 * picked, nothing saying which answer works. An under-13 answer at signup
 * keeps the form shut on this browser for a day so it can't simply be retried.
 */

const BLOCK_KEY = "poke-pack-age-block";
const BLOCK_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ageFieldsHtml() {
  const year = new Date().getFullYear();
  const years = [];
  for (let y = year; y >= year - 100; y -= 1) years.push(`<option value="${y}">${y}</option>`);
  return `<fieldset class="field age-field">
      <legend>Date of birth</legend>
      <div class="age-picks">
        <select name="birthMonth" required aria-label="Birth month">
          <option value="" selected disabled>Month</option>
          ${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}
        </select>
        <select name="birthYear" required aria-label="Birth year">
          <option value="" selected disabled>Year</option>
          ${years.join("")}
        </select>
      </div>
      <span class="hint">Never shown on your profile.</span>
    </fieldset>`;
}

export function agreeRowHtml() {
  return `<label class="check-row agree-row">
      <input type="checkbox" name="agree" required />
      <span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of use</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>.</span>
    </label>`;
}

/** { birthMonth, birthYear, agree } from a form holding the fields above. */
export function readAgeFields(data) {
  return {
    birthMonth: Number(data.get("birthMonth")) || 0,
    birthYear: Number(data.get("birthYear")) || 0,
    agree: data.has("agree"),
  };
}

export function ageBlocked() {
  try {
    const at = Number(localStorage.getItem(BLOCK_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < BLOCK_MS;
  } catch {
    return false;
  }
}

export function blockAge() {
  try {
    localStorage.setItem(BLOCK_KEY, String(Date.now()));
  } catch {
    /* storage off: the server still says no */
  }
}

export const UNDERAGE_HTML = `<div class="age-block" role="alert">
    <h2>Accounts are for players 13 and older</h2>
    <p>You can still look around: Home, Packs and the Catalog are open to everyone.</p>
  </div>`;

let sheet = null;
let busy = false;

/**
 * Shows the sheet while `user` is signed in and hasn't agreed to these Terms,
 * hides it otherwise. `api` is js/api.js api; `done(result)` gets the
 * Worker's answer ({ user, save } or { deleted: true }); `signOut()` signs out.
 */
export function syncTermsSheet(user, { api, done, signOut }) {
  const want = Boolean(user && user.termsOk === false);
  if (!want) {
    sheet?.remove();
    sheet = null;
    document.body.classList.remove("terms-open");
    return;
  }
  if (sheet) return;
  sheet = document.createElement("div");
  sheet.className = "terms-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "terms-title");
  paintAsk(user);
  document.body.append(sheet);
  document.body.classList.add("terms-open");
  sheet.querySelector("select")?.focus({ preventScroll: true });

  sheet.addEventListener("click", async (e) => {
    if (e.target.closest("[data-terms-out]")) {
      if (busy) return;
      busy = true;
      try {
        await signOut();
      } finally {
        busy = false;
      }
      return;
    }
    if (e.target.closest("[data-terms-back]")) {
      paintAsk(user);
      return;
    }
    if (e.target.closest("[data-terms-delete]")) {
      await send(sheet.dataset.pending ? JSON.parse(sheet.dataset.pending) : null, true);
    }
  });
  sheet.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = readAgeFields(new FormData(e.target));
    await send(body, false);
  });

  async function send(body, confirmUnder13) {
    if (!body || busy) return;
    busy = true;
    const err = sheet?.querySelector(".form-error");
    if (err) err.textContent = "";
    try {
      const result = await api("/api/me/terms", {
        method: "POST",
        body: JSON.stringify({ ...body, ...(confirmUnder13 ? { confirmUnder13: true } : {}) }),
      });
      busy = false;
      done(result);
    } catch (error) {
      busy = false;
      if (error?.payload?.underage) {
        paintUnder13(body);
        return;
      }
      if (err) err.textContent = error.message || "Couldn't save that. Try again.";
    }
  }
}

function paintAsk(user) {
  delete sheet.dataset.pending;
  sheet.innerHTML = `<form class="terms-card auth-form" novalidate>
      <h2 id="terms-title">Before you keep playing</h2>
      <p>poke-pack.rip now has <a href="/terms" target="_blank" rel="noopener">Terms of use</a> and a <a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>. Add your date of birth and agree to keep playing as @${String(user.handle || "").replace(/[^a-z0-9_]/gi, "")}.</p>
      ${ageFieldsHtml()}
      ${agreeRowHtml()}
      <p class="form-error" role="alert"></p>
      <button class="solid" type="submit">Agree and continue</button>
      <button class="text-btn terms-out" type="button" data-terms-out>Sign out instead</button>
    </form>`;
}

function paintUnder13(body) {
  sheet.dataset.pending = JSON.stringify(body);
  sheet.innerHTML = `<div class="terms-card">
      <h2 id="terms-title">Accounts are for players 13 and older</h2>
      <p>If that date of birth is right, this account and everything on it will be deleted. It can't be undone.</p>
      <p class="form-error" role="alert"></p>
      <button class="solid danger-solid" type="button" data-terms-delete>Delete my account</button>
      <button class="text-btn terms-out" type="button" data-terms-back>The date is wrong</button>
    </div>`;
}
