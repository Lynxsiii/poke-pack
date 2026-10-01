/* "Sell all winnings": the one button every casino result screen shares
   (coinflip, jackpot, pack battles). The Worker decides what counts as
   winnings and pays what selling always pays (worker/winnings.js): cards at the
   market price, graded slabs at their graded value. This only asks and shows
   the answer.

     mountWinnings(container, { source: "coinflip"|"jackpot"|"battle", id, ctx })

   GET  /api/casino/winnings/<source>/<id>  -> { eligible, cards, slabs, coins, soldCoins, sold, more }
   POST /api/casino/winnings/sell { source, id, slabs?: false }
        -> { sold: { coins, cards, slabs, remaining, more }, save }

   A battle never has slabs, so `slabs` may be missing. When the viewer won slabs
   and cards, a quiet second action sells the cards and keeps the slabs.
   ctx needs applySave(save) and toast(text). The container stays empty when the
   viewer won nothing they still hold. */
import { api, esc, coins, coinTag, plural } from "./casino-kit.js";

const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

/** "3 cards at the market price", "1 slab at its graded value", or both. */
function noteFor(info) {
  // a very big win is sold in parts, and only the first part is priced here
  if (info.more) return "A very big win sells in batches in one tap. The price shown is the first batch, so you get more.";
  const cards = Number(info.cards) || 0;
  const slabs = Number(info.slabs) || 0;
  if (cards && slabs) return `${plural(cards, "card")} at the market price, ${plural(slabs, "slab")} at graded value`;
  if (slabs) return `${plural(slabs, "slab")} at ${slabs === 1 ? "its" : "their"} graded value`;
  return `${plural(cards, "card")} at the market price`;
}

/** "Sold 3 cards and 1 slab for 120.50 coins." */
function soldToast(cards, slabs, total) {
  const what = [cards ? plural(cards, "card") : "", slabs ? plural(slabs, "slab") : ""].filter(Boolean).join(" and ") || "nothing";
  return `Sold ${what} for ${coins(total)} coins.`;
}

export async function mountWinnings(container, { source, id, ctx }) {
  if (!container || !ctx?.user?.()) return;
  const token = (container._winToken = (container._winToken || 0) + 1);
  const live = () => container.isConnected && container._winToken === token;
  const url = `/api/casino/winnings/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
  let info = null;
  try {
    info = await api(url);
  } catch {
    return; // not a winner, or nothing to offer: no button
  }
  if (!live() || !info?.eligible) return;

  const paint = (busy = false) => {
    const cards = Number(info.cards) || 0;
    const slabs = Number(info.slabs) || 0;
    if (cards > 0 || slabs > 0) {
      const sold = info.soldCoins > 0 ? `<p class="cs-sold">Winnings sold for ${coinTag(info.soldCoins)}.</p>` : "";
      container.innerHTML = `${sold}<button class="ghost cs-sell" type="button" data-sell ${busy ? "disabled" : ""}>${
        busy ? "Selling" : `Sell all winnings ${coinTag(info.coins)}${info.more ? "+" : ""}`
      }</button><small>${noteFor(info)}</small>${
        cards > 0 && slabs > 0
          ? `<button class="cs-link cs-sell-cards" type="button" data-sell-cards ${busy ? "disabled" : ""}>Sell cards, keep the slabs</button>`
          : ""
      }`;
    } else if (info.soldCoins > 0) {
      container.innerHTML = `<p class="cs-sold">Winnings sold for ${coinTag(info.soldCoins)}.</p>`;
    } else container.innerHTML = "";
  };
  paint();

  async function sell(keepSlabs) {
    paint(true);
    try {
      let total = 0;
      let cards = 0;
      let slabs = 0;
      // A very large pot is sold in parts; keep going until it is all gone.
      for (let guard = 0; guard < 30; guard++) {
        let data;
        try {
          data = await post("/api/casino/winnings/sell", keepSlabs ? { source, id, slabs: false } : { source, id });
        } catch (err) {
          if (guard === 0) throw err;
          break; // a later pass found nothing left to sell: the first pass already worked
        }
        const s = data.sold || {};
        total += Number(s.coins) || 0;
        cards += Number(s.cards) || 0;
        slabs += Number(s.slabs) || 0;
        if (data.save) ctx.applySave?.(data.save);
        // Kept slabs still count as "remaining" on the server; stop when a pass sold nothing.
        if (!s.remaining || (!Number(s.cards) && !Number(s.slabs))) break;
      }
      ctx.toast?.(soldToast(cards, slabs, total));
      let next = null;
      try {
        next = await api(url);
      } catch { /* fall back to what we know */ }
      if (next?.eligible) info = next;
      else info = { ...info, cards: 0, slabs: keepSlabs ? info.slabs : 0, coins: 0, soldCoins: (info.soldCoins || 0) + total };
      if (live()) paint();
    } catch (err) {
      ctx.toast?.(err?.message || "Couldn't sell those.");
      if (live()) {
        try {
          info = await api(url);
        } catch { /* keep what we had */ }
        if (live()) paint();
      }
    }
  }

  container.onclick = (e) => {
    if (!live()) return;
    if (e.target.closest("[data-sell-cards]")) return sell(true);
    if (e.target.closest("[data-sell]")) return sell(false);
  };
}

/** The empty slot a result screen drops in; `mountWinnings` fills it. */
export const winningsSlot = (source, id) =>
  `<div class="cs-winnings" data-winnings data-source="${esc(source)}" data-game="${esc(id)}"></div>`;
