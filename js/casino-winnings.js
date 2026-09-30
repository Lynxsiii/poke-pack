/* "Sell all winnings": the one button every casino result screen shares
   (coinflip, jackpot, pack battles). The Worker decides what counts as
   winnings and pays the market rate selling always pays (worker/winnings.js);
   this only asks and shows the answer.

     mountWinnings(container, { source: "coinflip"|"jackpot"|"battle", id, ctx })

   ctx needs applySave(save) and toast(text). The container stays empty when the
   viewer won nothing they still hold. */
import { api, esc, coins, coinTag, plural } from "./casino-kit.js";

const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

export async function mountWinnings(container, { source, id, ctx }) {
  if (!container || !ctx?.user?.()) return;
  const token = (container._winToken = (container._winToken || 0) + 1);
  const live = () => container.isConnected && container._winToken === token;
  let info = null;
  try {
    info = await api(`/api/casino/winnings/${encodeURIComponent(source)}/${encodeURIComponent(id)}`);
  } catch {
    return; // not a winner, or nothing to offer: no button
  }
  if (!live() || !info?.eligible) return;

  const paint = (busy = false, note = "") => {
    if (info.cards > 0) {
      container.innerHTML = `<button class="ghost cs-sell" type="button" data-sell ${busy ? "disabled" : ""}>${
        busy ? "Selling" : `Sell all winnings ${coinTag(info.coins)}`
      }</button><small>${note || `${plural(info.cards, "card")} at the market price`}</small>`;
    } else if (info.soldCoins > 0) {
      container.innerHTML = `<p class="cs-sold">Winnings sold for ${coinTag(info.soldCoins)}.</p>`;
    } else container.innerHTML = "";
  };
  paint();

  container.onclick = async (e) => {
    if (!e.target.closest("[data-sell]") || !live()) return;
    paint(true);
    try {
      let total = 0;
      let cards = 0;
      // A very large pot is sold in parts; keep going until it is all gone.
      for (let guard = 0; guard < 30; guard++) {
        const data = await post("/api/casino/winnings/sell", { source, id });
        total += data.sold.coins;
        cards += data.sold.cards;
        ctx.applySave?.(data.save);
        if (!data.sold.remaining) break;
      }
      info = { ...info, cards: 0, coins: 0, soldCoins: (info.soldCoins || 0) + total };
      ctx.toast?.(`Sold ${plural(cards, "card")} for ${coins(total)} coins.`);
      if (live()) paint();
    } catch (err) {
      ctx.toast?.(err?.message || "Couldn't sell those.");
      if (live()) {
        try {
          info = await api(`/api/casino/winnings/${encodeURIComponent(source)}/${encodeURIComponent(id)}`);
        } catch { /* keep what we had */ }
        if (live()) paint();
      }
    }
  };
}

/** The empty slot a result screen drops in; `mountWinnings` fills it. */
export const winningsSlot = (source, id) =>
  `<div class="cs-winnings" data-winnings data-source="${esc(source)}" data-game="${esc(id)}"></div>`;
