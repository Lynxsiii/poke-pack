/**
 * Stamp a per-card etch map onto Special Illustration and Black White Rares.
 *
 * Maps live at assets/foil/etch/<set>/<number>.webp, derived from the same
 * path as --art (including the -sm thumbnail suffix). Applied here instead of
 * in app.js so account work on that file does not collide.
 */
const ETCHED = ["foil-sir", "foil-bwr"];

function isEtched(el) {
  return ETCHED.some((name) => el.classList.contains(name));
}

function etchUrlFromArt(art) {
  const match = String(art || "").match(/assets\/cards\/([^/]+)\/([^"'?)]+)/i);
  if (!match) return "";
  const file = match[2].replace(/-sm(\.[a-z0-9]+)$/i, "$1");
  return `assets/foil/etch/${match[1]}/${file}`;
}

function apply(el) {
  if (!(el instanceof HTMLElement) || !isEtched(el) || el.dataset.etchReady) return;
  const art = el.style.getPropertyValue("--art") || getComputedStyle(el).getPropertyValue("--art");
  const rel = etchUrlFromArt(art);
  if (!rel) return;
  let href = rel;
  try {
    href = new URL(rel, document.baseURI).href;
  } catch {
    /* keep relative */
  }
  el.style.setProperty("--etch", `url("${href}")`);
  el.classList.add("has-etch");
  el.dataset.etchReady = "1";
}

function scan(node) {
  if (!(node instanceof Element)) return;
  if (node.classList.contains("tcg")) apply(node);
  node.querySelectorAll(".tcg.foil-sir, .tcg.foil-bwr").forEach(apply);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) scan(node);
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scan(document.documentElement);
