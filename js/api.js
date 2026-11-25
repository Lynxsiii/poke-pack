export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `Request failed (${status})`);
    this.status = status;
    this.payload = payload || {};
  }
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  let res;
  let text;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...opts,
      headers,
    });
    text = await res.text();
  } catch (err) {
    // A cancelled request stays what it is; a dropped connection gets words a player can read
    // (the browser's own are "Failed to fetch" or "Load failed").
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, { error: "Can't reach the server. Check your connection and try again." });
  }
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // An error page that is not the API's (a gateway's HTML) is never shown as a message.
      data = res.ok ? { error: text } : { error: "The server had a problem. Try again in a moment." };
    }
  }
  if (!res.ok) {
    // The session ended somewhere else (signed out in another tab, expired): the page hears it once and shows signed out.
    if (res.status === 401 && data?.error === "Sign in first." && !/^\/api\/(auth\/|me$)/.test(String(path).split("?")[0])) {
      try {
        window.dispatchEvent(new Event("pp:signed-out"));
      } catch {
        /* no window (tests) */
      }
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

/** Collect the coins and gifts of every level reached and not yet paid. No body: the server decides what is owed. Resolves { save, paid:{ levels, coins, gear } }. */
export function claimLevels() {
  return api("/api/levels/claim", { method: "POST" });
}
