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
  const res = await fetch(path, {
    credentials: "same-origin",
    ...opts,
    headers,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Collect the coins and gifts of every level reached and not yet paid. No body: the server decides what is owed. Resolves { save, paid:{ levels, coins, gear } }. */
export function claimLevels() {
  return api("/api/levels/claim", { method: "POST" });
}
