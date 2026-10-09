/**
 * The Terms, the Privacy Policy and the Legal page (/terms, /privacy, /legal).
 * Plain words, one column, nothing lit, like the patch notes. The rules they
 * describe live in worker/terms.js (age, Terms version, what deleting clears)
 * and worker/gates.js (the 18+ casino); change the words here when those move.
 */

export const LEGAL_UPDATED = "2026-10-09";
export const CONTACT_EMAIL = "legal@poke-pack.rip";

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
const updated = new Date(`${LEGAL_UPDATED}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const FAN_LINE =
  "poke-pack.rip is an unofficial, free fan project. It is not made, endorsed, sponsored or approved by Nintendo, The Pokémon Company, Game Freak, Creatures Inc. or Wizards of the Coast.";

const DOCS = {
  terms: {
    title: "Terms of use",
    lede: "The rules for playing on poke-pack.rip. By making an account, or by tapping Agree when we ask, you accept them.",
    body: `
      <h2>The short version</h2>
      <ul>
        <li>poke-pack.rip is a free fan game. You need to be 13 or older to make an account.</li>
        <li>Coins, cards, slabs and everything else here are pretend. They have no real-world value, can't be bought with money and can never be cashed out, sold or traded for anything real.</li>
        <li>The casino games are for players 18 and older. No real money goes in and nothing real comes out.</li>
        <li>Be decent in chat, DMs and comments. We can remove anything and close accounts that break these rules.</li>
        <li>We aren't connected to Pokémon or Nintendo. The site can change, lose data or shut down at any time, and comes with no guarantees.</li>
      </ul>

      <h2>Who can play</h2>
      <p>You must be at least 13 to make an account. If you're under 18, check with a parent or guardian before you sign up. If we learn an account belongs to someone under 13, we delete it.</p>
      <p>The casino games (Coinflip, Jackpot, Pack battles and the Upgrader) are only open to accounts whose owner is 18 or older.</p>

      <h2>Your account</h2>
      <p>Pick a trainer name and handle that don't pretend to be someone else and aren't rude. We may change or remove ones that are. Keep your password to yourself: we don't ask for an email, so we can't send a reset link if you lose it. You're responsible for what happens on your account.</p>

      <h2>Coins, cards and other items</h2>
      <p>Everything you collect or win here is virtual. It belongs to the game, not to you, and we let you use it while you play.</p>
      <ul>
        <li>Coins and items have no cash value. You can't buy them with real money, and you can't cash them out or exchange them for real cards, gift cards or anything else.</li>
        <li>Don't sell, buy or trade accounts, coins or items for real money or real goods, here or anywhere else. Accounts that do are closed.</li>
        <li>The prices shown on cards and products come from public market data and are there for fun. They aren't offers to buy or sell anything.</li>
        <li>We can change balances, odds, prices and items, fix mistakes, take back things that came from a bug or from cheating, or reset the game.</li>
      </ul>

      <h2>The casino games</h2>
      <p>Coinflip, Jackpot, Pack battles and the Upgrader are free games of chance played with virtual coins and virtual cards. You can't put real money in and you can't win anything of value, so they aren't gambling. They are still only for players 18 and older.</p>
      <p>If gambling has ever been a problem for you or someone close to you, skip the casino. Free, confidential help comes from the <a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noopener">National Council on Problem Gambling</a> in the US and <a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> in the UK.</p>

      <h2>Chat, DMs, profiles and comments</h2>
      <p>What you write is yours, and you let us show it on the site and in our Discord. Don't post:</p>
      <ul>
        <li>harassment, threats, hate, or anything sexual;</li>
        <li>personal details such as a real name, address, school, phone number or photos, yours or anyone else's;</li>
        <li>spam, scams, or offers to trade for real money;</li>
        <li>anything illegal, or anything you don't have the right to share.</li>
      </ul>
      <p>We can remove anything we think breaks these rules and suspend or delete accounts, with or without warning. To report something, use the bug reports forum in <a href="/discord" target="_blank" rel="noopener">our Discord</a> or email ${mail}.</p>

      <h2>Play fair</h2>
      <p>No bots, scripts, exploits or second accounts used to farm coins. If you find a bug, report it. Gains from bugs can be taken back.</p>

      <h2>Pokémon and other people's work</h2>
      <p>${FAN_LINE} Pokémon, card names, card art and logos are trademarks and copyrights of their owners, used here for a non-commercial fan project.</p>
      <p>If you own something shown here and want it taken down, email ${mail} and it comes down. See the <a href="/legal">Legal page</a> for more.</p>

      <h2>No guarantees</h2>
      <p>The site is provided as it is, for free. It can go down, lose data, change or close at any time without notice. As far as the law allows, we aren't responsible for any loss that comes from using it, and we owe you nothing for coins or items that are changed or lost.</p>

      <h2>Ending things</h2>
      <p>You can delete your account whenever you like in Account, Security. We can suspend or delete accounts that break these Terms.</p>

      <h2>Changes</h2>
      <p>When these Terms change, the date at the top changes too. For a big change we ask you to agree again before you keep playing.</p>

      <h2>Contact</h2>
      <p>${mail}</p>`,
  },

  privacy: {
    title: "Privacy policy",
    lede: "What poke-pack.rip keeps about you, who can see it and how to get rid of it.",
    body: `
      <h2>The short version</h2>
      <ul>
        <li>We keep as little as we can. No email, no real name, no phone number.</li>
        <li>No ads, no analytics, no tracking cookies. We never sell or share your information for advertising.</li>
        <li>You can delete your account and everything on it at any time.</li>
      </ul>

      <h2>What we keep when you make an account</h2>
      <ul>
        <li>Your trainer name, handle and password. The password is stored as a salted PBKDF2 hash, never as the password itself.</li>
        <li>Your birth month and year, only to check the age rules. They're never shown to anyone.</li>
        <li>Your game: cards, coins, packs opened, pull history, binder, levels, quests, achievements, slabs, gear and casino games.</li>
        <li>Your profile choices: avatar, banner, frame, bio, colours and layout.</li>
        <li>What you write: global chat messages, DMs, profile comments, and your friends list.</li>
        <li>When you were last online, and when you agreed to the Terms.</li>
      </ul>
      <p>Without an account, your game stays in your own browser's storage and isn't sent to us, unless you make an account and choose to bring it with you.</p>

      <h2>Cookies and browser storage</h2>
      <p>Signing in sets one cookie, <code>pp_sid</code>, which keeps you signed in for up to 30 days. Your settings and any guest game sit in your browser's local storage. That's all: nothing here tracks you or shows ads, so there's nothing to opt in to.</p>

      <h2>Who can see what</h2>
      <ul>
        <li>Anyone can see your trainer name, handle, avatar, bio, title, level, public profile and binder, whether you're online, your global chat messages and your profile comments.</li>
        <li>DMs are seen by you and the person you message. They aren't end-to-end encrypted: whoever runs the site can read the database to deal with reports and fix bugs.</li>
        <li>Your password and birth month are never shown.</li>
      </ul>

      <h2>Our Discord feed</h2>
      <p>Big pulls (worth $100 or more, a Special Illustration Rare or better, or a Black Label 10) are posted in our Discord server with your trainer name, handle and the card. You can turn this off in Settings, Community. Posts already made stay on Discord unless you ask us to remove them.</p>

      <h2>Services we use</h2>
      <ul>
        <li><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare</a> hosts the site and its database. Like any host it handles your IP address and browser details to deliver pages and stop attacks.</li>
        <li><a href="https://discord.com/privacy" target="_blank" rel="noopener">Discord</a> carries the pulls feed and our server.</li>
        <li>Your browser loads Pokémon sprites from GitHub and may look up card prices from pokemontcg.io and TCGdex. Those services see your IP address the way any website does. We don't send them anything about your account.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>For as long as your account exists. Deleting the account removes it from the site straight away. Copies can stay in Cloudflare's automatic database backups for up to 30 days before they're gone for good.</p>

      <h2>Deleting your account</h2>
      <p>Go to Account, Security, Delete account. That removes your profile, cards, coins, history, levels, slabs, gear, chat messages, DMs, profile comments and friends. Casino and battle games you played with others keep an anonymous id so their history still adds up, but nothing that says who you were.</p>

      <h2>Your rights</h2>
      <p>Wherever you live, you can ask for a copy of what we hold about you, ask us to correct it, or ask us to delete it. Email ${mail} from the handle's owner, or message us on Discord, and we'll answer within 30 days. We use your information only to run the account you asked for and to keep the site safe and fair. If you're in the EU or UK you can also complain to your data protection authority.</p>

      <h2>Children</h2>
      <p>poke-pack.rip isn't for children under 13 and doesn't knowingly keep information about them. Signup asks for a birth month and year, and anyone under 13 can't make an account. If you're a parent and think your child under 13 has an account, email ${mail} with the handle and we'll delete it.</p>

      <h2>Changes</h2>
      <p>When this policy changes, the date at the top changes too. For a big change we ask you to agree again.</p>

      <h2>Contact</h2>
      <p>${mail}</p>`,
  },

  legal: {
    title: "Legal",
    lede: "Who's behind poke-pack.rip, what it isn't, and how to reach us.",
    body: `
      <h2>A fan project</h2>
      <p>${FAN_LINE}</p>
      <p>Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc. The Pokémon Trading Card Game, its card names, card art, set symbols and logos belong to The Pokémon Company, Nintendo, Creatures Inc., GAME FREAK inc. and the card artists. They're used here, without permission, for a free, non-commercial fan site, and we claim no ownership of any of them.</p>
      <p>Card names, numbers, artists and scans match the public Pokémon TCG card database. Market prices come from public sales data and are shown for fun.</p>

      <h2>No real money</h2>
      <p>Coins, packs, cards, slabs and every other item on poke-pack.rip are virtual. They can't be bought with real money and can never be cashed out, sold or exchanged for anything of value. The casino games are free games of chance for players 18 and older, with nothing of value to win. Nothing on the site is for sale.</p>

      <h2>Takedowns and copyright</h2>
      <p>If you own a trademark or copyright shown here, or something a player posted, and want it removed, email ${mail} with what it is and where it appears. We take it down, usually within a day or two, and no formal notice is needed.</p>

      <h2>Contact</h2>
      <p>Rights holders, parents and privacy requests: ${mail}. Players: the bug reports forum in <a href="/discord" target="_blank" rel="noopener">our Discord</a> is quickest.</p>

      <h2>The site's own code</h2>
      <p>poke-pack.rip's code is licensed under the GNU General Public License v3.0. The holofoil effects build on <a href="https://github.com/simeydotme/pokemon-cards-css" target="_blank" rel="noopener">pokemon-cards-css</a> by Simon Goellner, also GPL-3.0. The Bricolage Grotesque font is under the SIL Open Font License 1.1.</p>

      <p class="lg-links"><a href="/terms">Terms of use</a> <a href="/privacy">Privacy policy</a></p>`,
  },
};

export const LEGAL_TITLES = { terms: "Terms of use", privacy: "Privacy policy", legal: "Legal" };

/** Draws one document into `el`. `which` is terms, privacy or legal. */
export function renderLegalPage(el, which) {
  if (!el) return;
  const doc = DOCS[which] || DOCS.legal;
  el.innerHTML = `<article class="lg-doc">
      <header class="lg-head">
        <h1>${doc.title}</h1>
        <p class="lg-lede">${doc.lede}</p>
        <p class="lg-date">Last updated ${updated}</p>
      </header>
      ${doc.body}
    </article>`;
}
