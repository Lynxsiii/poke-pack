/*
 * Price history chart for the card inspector.
 *
 * Points come from data/prices/<set>.json, one file per set, loaded the first
 * time one of that set's cards is inspected. scripts/backfill_prices.py fills
 * each file with a year of TCGplayer market prices (weekly, then every 3 days,
 * then daily for the last month) and the daily refresh appends to it. Nothing
 * here interpolates or invents a value: a card with a single snapshot draws a
 * single snapshot and says so, because a made-up trend line on something people
 * treat as a price guide would be worse than no line at all.
 */

const RANGES = [
  ["7d", "7D", 7],
  ["30d", "30D", 30],
  ["90d", "90D", 90],
  ["all", "All", Infinity],
];

/** Set id -> { cards, sealed } once its file has loaded. */
const loaded = new Map();
const pending = new Map();
/** Sets whose last fetch failed: the chart stops saying "loading" for them. */
const failed = new Set();
/** Card id -> [day, price] from the live ticker, laid over the loaded file. */
const live = new Map();

/** Set ids never contain a dash, so a card id's set is everything before one. */
const setOf = (id) => String(id || "").split("-")[0];

const series = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

/**
 * Fetch a set's price history once. A failed fetch is not cached, so the next
 * call tries again.
 */
export function loadPriceHistory(setId) {
  if (!setId) return Promise.resolve(null);
  if (loaded.has(setId)) return Promise.resolve(loaded.get(setId));
  if (!pending.has(setId)) {
    const request = fetch(`data/prices/${encodeURIComponent(setId)}.json`, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then((store) => {
        const clean = { cards: series(store?.cards), sealed: series(store?.sealed) };
        loaded.set(setId, clean);
        failed.delete(setId);
        return clean;
      })
      .catch(() => {
        failed.add(setId);
        return null;
      })
      .finally(() => pending.delete(setId));
    pending.set(setId, request);
  }
  return pending.get(setId);
}

/** Whether a card's set history has arrived. */
export function priceHistoryReady(cardId) {
  return loaded.has(setOf(cardId));
}

/** Fold a live snapshot into today's chart point so the inspector moves with the ticker. */
export function noteLivePrice(cardId, price, day) {
  if (!cardId || !(price > 0) || !day) return;
  live.set(cardId, [day, Math.round(Number(price) * 100) / 100]);
}

/** Raw [date, price] points for a card, oldest first. */
export function pointsFor(cardId) {
  const raw = loaded.get(setOf(cardId))?.cards?.[cardId];
  const points = Array.isArray(raw) ? raw.filter((p) => Array.isArray(p) && p.length === 2) : [];
  const now = live.get(cardId);
  if (!now) return points;
  const last = points[points.length - 1];
  if (last && last[0] > now[0]) return points;
  return last && last[0] === now[0] ? [...points.slice(0, -1), now] : [...points, now];
}

function withinRange(points, days) {
  if (!Number.isFinite(days) || points.length === 0) return points;
  const newest = Date.parse(points[points.length - 1][0]);
  const floor = newest - days * 86_400_000;
  const slice = points.filter(([date]) => Date.parse(date) >= floor);
  // Never hand back a single point for a multi-point card — a range that
  // narrow reads as "no data" when really it's just a short window.
  return slice.length >= 2 ? slice : points.slice(-2);
}

const fmtMoney = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (iso, withYear = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });

/**
 * Build the chart geometry in a 0..W / 0..H viewBox. Returns null when there
 * is nothing to draw. `byDate` spaces points by their date rather than their
 * index: price history is weekly a year back and daily this month, and evenly
 * spaced points would stretch the last month across most of the chart.
 */
function geometry(points, w, h, pad, byDate = false) {
  if (!points.length) return null;
  const values = points.map(([, price]) => price);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Flat series would divide by zero, so give it a nominal band to sit in.
  const span = hi - lo || Math.max(hi * 0.08, 0.02);
  const top = hi + span * 0.18;
  const bottom = Math.max(0, lo - span * 0.18);
  const range = top - bottom || 1;

  const times = byDate ? points.map(([date]) => Date.parse(date)) : null;
  const t0 = times?.[0];
  const duration = times ? times[times.length - 1] - t0 : 0;
  const x = (i) =>
    points.length === 1
      ? w / 2
      : times && duration > 0
        ? pad + ((times[i] - t0) * (w - pad * 2)) / duration
        : pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v) => h - pad - ((v - bottom) / range) * (h - pad * 2);

  const coords = points.map(([date, price], i) => ({ date, price, cx: x(i), cy: y(price) }));
  return { coords, top, bottom };
}

function linePath(coords) {
  return coords.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ");
}

function areaPath(coords, h, pad) {
  if (coords.length < 2) return "";
  const base = h - pad;
  return `${linePath(coords)} L${coords[coords.length - 1].cx.toFixed(1)} ${base} L${coords[0].cx.toFixed(1)} ${base} Z`;
}

/**
 * Render the whole price block for a card: headline price, change, range
 * buttons and the SVG. `mount` is the element to fill.
 */
export function renderPriceChart(mount, card, range = "30d") {
  const all = pointsFor(card.id);
  const current =
    typeof card.market === "number" ? card.market : all.length ? all[all.length - 1][1] : null;
  // Loaded, or failed and not coming: either way the chart shows what it has.
  const ready = loaded.has(setOf(card.id)) || failed.has(setOf(card.id));

  if (current == null && ready) {
    mount.innerHTML = `<div class="pc-empty">No market price for this card yet.</div>`;
    return;
  }

  if (all.length < 2 && !ready) {
    // Same height as the chart, so the dialog doesn't jump when the file lands.
    mount.innerHTML = `
      <div class="pc-head">
        <div class="pc-now">
          <span class="pc-label">Market price</span>
          <b>${current == null ? "—" : `$${fmtMoney(current)}`}</b>
        </div>
      </div>
      <div class="pc-loading" aria-busy="true">Loading price history…</div>`;
    return;
  }

  if (all.length < 2) {
    mount.innerHTML = `
      <div class="pc-head">
        <div class="pc-now">
          <span class="pc-label">Market price</span>
          <b>$${fmtMoney(current)}</b>
        </div>
      </div>
      <div class="pc-empty">
        <span class="pc-dot" aria-hidden="true"></span>
        Tracking started ${all.length ? fmtDate(all[0][0]) : "today"} — the chart fills in
        as prices refresh.
      </div>`;
    return;
  }

  const days = (RANGES.find(([id]) => id === range) || RANGES[1])[2];
  const shown = withinRange(all, days);
  const first = shown[0][1];
  const delta = current - first;
  const pct = first ? (delta / first) * 100 : 0;
  const dir = delta > 0.004 ? "up" : delta < -0.004 ? "down" : "flat";

  const W = 640;
  const H = 200;
  const PAD = 16;
  const geo = geometry(shown, W, H, PAD, true);
  const { coords } = geo;
  // A year of history starts and ends on the same month; the year tells them apart.
  const years = shown[0][0].slice(0, 4) !== shown[shown.length - 1][0].slice(0, 4);

  const buttons = RANGES.filter(([, , d]) => {
    if (!Number.isFinite(d)) return true;
    const spanDays =
      (Date.parse(all[all.length - 1][0]) - Date.parse(all[0][0])) / 86_400_000;
    return spanDays >= d * 0.5;
  })
    .map(
      ([id, label]) =>
        `<button type="button" class="pc-range${id === range ? " on" : ""}" data-range="${id}"
           aria-pressed="${id === range}">${label}</button>`
    )
    .join("");

  const hi = Math.max(...shown.map(([, p]) => p));
  const lo = Math.min(...shown.map(([, p]) => p));

  mount.innerHTML = `
    <div class="pc-head">
      <div class="pc-now">
        <span class="pc-label">Market price</span>
        <b>$${fmtMoney(current)}</b>
        <span class="pc-delta ${dir}">
          ${dir === "up" ? "▲" : dir === "down" ? "▼" : "■"}
          $${fmtMoney(Math.abs(delta))} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)
        </span>
      </div>
      <div class="pc-ranges" role="group" aria-label="Chart range">${buttons}</div>
    </div>

    <figure class="pc-figure">
      <svg class="pc-svg ${dir}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           role="img" aria-label="Price history, ${shown.length} points from $${fmtMoney(lo)} to $${fmtMoney(hi)}">
        <defs>
          <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" class="pc-stop-a" />
            <stop offset="100%" class="pc-stop-b" />
          </linearGradient>
        </defs>
        <path class="pc-area" d="${areaPath(coords, H, PAD)}" fill="url(#pcFill)" />
        <path class="pc-line" d="${linePath(coords)}" />
        <line class="pc-cross" x1="0" y1="${PAD}" x2="0" y2="${H - PAD}" opacity="0" />
        <circle class="pc-marker" r="4.5" cx="0" cy="0" opacity="0" />
      </svg>
      <div class="pc-tip" hidden><b></b><span></span></div>
      <figcaption class="pc-foot">
        <span>${fmtDate(shown[0][0], years)}</span>
        <span class="pc-band">low $${fmtMoney(lo)} · high $${fmtMoney(hi)}</span>
        <span>${fmtDate(shown[shown.length - 1][0], years)}</span>
      </figcaption>
    </figure>`;

  wireHover(mount, coords, W, H, years);
}

/**
 * Compact net-worth sparkline for the home page.
 *
 * `points` are [timestamp, netWorth] samples recorded by the app whenever money
 * moves; `baseline` is what the player was granted, so the fill reads green
 * above break-even and red below. Same geometry helpers as the price chart, so
 * the two charts stay visually consistent.
 */
export function renderWorthChart(mount, points, baseline) {
  const clean = (points || []).filter((p) => Array.isArray(p) && p.length === 2);
  if (clean.length < 2) {
    mount.innerHTML = `<div class="pc-empty pc-empty-sm">
      <span class="pc-dot" aria-hidden="true"></span>
      Rip or sell a card and your net worth starts charting here.
    </div>`;
    return;
  }

  const W = 560;
  const H = 120;
  const PAD = 10;
  const series = clean.map(([, value]) => value);
  const geo = geometry(clean.map(([at, value]) => [at, value]), W, H, PAD);
  const { coords } = geo;
  const now = series[series.length - 1];
  const dir = baseline == null ? "flat" : now > baseline + 0.004 ? "up" : now < baseline - 0.004 ? "down" : "flat";

  // Break-even rule, only when it falls inside the plotted band.
  let rule = "";
  if (baseline != null && baseline > geo.bottom && baseline < geo.top) {
    const y = H - PAD - ((baseline - geo.bottom) / (geo.top - geo.bottom)) * (H - PAD * 2);
    rule = `<line class="pc-base" x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  }

  mount.innerHTML = `
    <svg class="pc-svg pc-spark ${dir}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="Net worth over your last ${clean.length} money moves">
      <defs>
        <linearGradient id="pcWorthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class="pc-stop-a" />
          <stop offset="100%" class="pc-stop-b" />
        </linearGradient>
      </defs>
      <path class="pc-area" d="${areaPath(coords, H, PAD)}" fill="url(#pcWorthFill)" />
      ${rule}
      <path class="pc-line" d="${linePath(coords)}" />
    </svg>`;
}

/**
 * Pointer tracking: snap a crosshair to the nearest point and follow it with a
 * tooltip. Works for mouse, pen and touch via pointer events.
 */
function wireHover(mount, coords, W, H, years = false) {
  const figure = mount.querySelector(".pc-figure");
  const svg = mount.querySelector(".pc-svg");
  const cross = mount.querySelector(".pc-cross");
  const marker = mount.querySelector(".pc-marker");
  const tip = mount.querySelector(".pc-tip");
  if (!figure || !svg) return;

  const show = (event) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const ratio = (event.clientX - box.left) / box.width;
    const target = ratio * W;
    let nearest = coords[0];
    for (const point of coords) {
      if (Math.abs(point.cx - target) < Math.abs(nearest.cx - target)) nearest = point;
    }

    cross.setAttribute("x1", nearest.cx);
    cross.setAttribute("x2", nearest.cx);
    cross.setAttribute("opacity", "1");
    marker.setAttribute("cx", nearest.cx);
    marker.setAttribute("cy", nearest.cy);
    marker.setAttribute("opacity", "1");

    tip.hidden = false;
    tip.querySelector("b").textContent = `$${fmtMoney(nearest.price)}`;
    tip.querySelector("span").textContent = fmtDate(nearest.date, years);
    // Position in figure space, clamped so the bubble never leaves the card.
    const left = (nearest.cx / W) * box.width;
    const top = (nearest.cy / H) * box.height;
    tip.style.left = `${Math.min(Math.max(left, 44), box.width - 44)}px`;
    tip.style.top = `${Math.max(top - 14, 0)}px`;
  };

  const hide = () => {
    cross.setAttribute("opacity", "0");
    marker.setAttribute("opacity", "0");
    tip.hidden = true;
  };

  figure.addEventListener("pointermove", show);
  figure.addEventListener("pointerdown", show);
  figure.addEventListener("pointerleave", hide);
  figure.addEventListener("pointercancel", hide);
}
