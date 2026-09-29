import { api } from './api.js';
import { battleResult } from './battle-rules.js';
import { PLAYABLE_SETS } from './catalog.js';

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coins = value => Number(value || 0).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2});
const coin = value => `<span class="battle-coins"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v16M2 10h16M4.3 4.3l11.4 11.4M15.7 4.3 4.3 15.7"/></svg>${coins(value)}</span>`;
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${({plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',back:'<path d="m14 6-6 6 6 6"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',play:'<path d="m9 5 11 7-11 7z"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',bot:'<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M8 12v2M16 12v2M9 17h6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 7M4 12l2 7a7 7 0 0 0 12-2"/>',check:'<path d="m5 12 4 4L19 6"/>'})[name] || ''}</svg>`;
const modeLabel = mode => ({standard:'Standard',crazy:'Crazy',shared:'Shared'})[mode] || 'Standard';
const scoreLabel = score => ({total:'Total pull value',last:'Last round',best:'Best card'})[score] || 'Total pull value';
const idOf = user => user?.id ?? user?.userId;
const imageOf = card => card?.image || card?.imageSmall || '';
const wrapperArt = new Map(PLAYABLE_SETS.map(set => [set.id,set.wrappers?.[0]?.art || '']));
const art = (src, alt = '', cls = '', lazy = true, fallback = '') => src || fallback ? `<img class="${cls}" src="${esc(src || fallback)}" alt="${esc(alt)}" ${fallback && fallback !== src ? `data-battle-fallback="${esc(fallback)}"` : ''} ${lazy ? 'loading="lazy"' : ''} decoding="async"/>` : `<span class="battle-art-missing ${cls}" aria-hidden="true">${icon('users')}</span>`;
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const options = {players:2,teams:false,mode:'standard',scoring:'total',fast:false,skipCommons:false,private:false};

/** All game state and results are owned by the server. This module only presents them. */
export function initBattles({root,getUser,getState,onSave,onNavigate,onSignIn,toast,onRefreshSave} = {}) {
  if (!root) return {show(){},hide(){},path:'/battles'};
  root.classList.add('battle-view');
  let visible = false, route = '', generation = 0, timer = 0, clockTimer = 0, clockOffset = 0;
  let catalog = [], limits = {maxPacks:72,maxRounds:96}, catalogPromise;
  let lineup = [], settings = {...options}, search = '', category = 'all', productLimit = 48;
  let listing = [], listTab = 'lobby', battle = null, busy = false, error = '', networkError = '';
  let detailKey = '', listKey = '', replayIndex = null, replayTimer = 0, savedFinish = '', lastAnimatedRound = -1, detailSequence = 0;
  let actions = new Set(), animations = new Set(), requestId = uuid();
  const manualReceipts = new Map();
  const now = () => Date.now() + clockOffset;
  const signed = () => !!idOf(getUser?.());
  const userSeat = () => battle?.seats?.find(seat => !seat.bot && String(seat.userId) === String(idOf(getUser?.())));
  const host = () => battle && String(battle.hostId) === String(idOf(getUser?.()));
  const motion = () => getState?.()?.settings?.motion !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.classList.contains('no-motion') && !document.hidden;
  const navigate = path => onNavigate ? onNavigate(path) : show(path);
  const stopMotion = () => { for (const a of animations) a.cancel(); animations.clear(); for (const a of actions) cancelAnimationFrame(a); actions.clear(); };
  const clearTimers = () => {clearTimeout(timer);clearInterval(clockTimer);clearTimeout(replayTimer);stopMotion();};
  const updateClock = data => {if (Number.isFinite(data?.serverNow)) clockOffset = data.serverNow - Date.now();};
  const report = message => {toast?.(message);};
  const save = async (data,actor) => {if (data?.save && actor && String(actor) === String(idOf(getUser?.()))) await onSave?.(data.save);};
  const balance = () => Number(getState?.()?.coins || 0);
  const failure = e => e?.status === 401 ? 'Sign in to take a seat in this battle.' : e?.message || 'The battle could not load. Try again.';
  const notice = () => error ? `<div class="battle-error" role="alert"><p>${esc(error)}</p><button class="battle-button" data-battle-action="retry">Try again</button></div>` : '';
  const routeId = () => route.split('/')[2];

  async function loadCatalog() {
    if (catalog.length) return catalog;
    if (!catalogPromise) catalogPromise = api('/api/battles/catalog').then(data => {catalog = data.products || [];limits = {...limits,...data.limits};return catalog;}).finally(() => {catalogPromise = null;});
    return catalogPromise;
  }
  const total = () => lineup.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const rounds = () => lineup.reduce((sum, row) => sum + Number(row.rounds ?? row.packs ?? 1) * row.quantity, 0);
  const packCount = () => lineup.reduce((sum, row) => sum + Number(row.packs || 0) * row.quantity, 0);
  const itemCount = () => lineup.reduce((sum, row) => sum + row.quantity, 0);
  const rulesCopy = s => s.mode === 'shared' ? 'Everyone shares the pulls.' : s.mode === 'crazy' ? 'Lowest score takes the cards.' : 'Highest score takes the cards.';
  const rulesLine = s => `${modeLabel(s.mode)}${s.teams ? ' 2v2' : ''} / ${scoreLabel(s.scoring)}${s.fast ? ' / Fast' : ''}${s.skipCommons ? ' / Skip commons' : ''}`;
  const selected = key => lineup.find(row => row.key === key)?.quantity || 0;
  const productLabel = p => p.productId === 'boosterPack' ? 'Booster pack' : p.packs ? `${p.packs} pack${p.packs === 1 ? '' : 's'}` : 'Promo product';
  const thumb = (p, cls = '') => `<span class="battle-product-art ${cls}">${art(p.image, '', '', true, wrapperArt.get(p.setId))}</span>`;

  function renderList() {
    const rows = listing.filter(b => listTab === 'all' || b.status === listTab);
    root.innerHTML = `<div class="battle-page-head"><div><h1>Pack battles</h1><p>Choose your packs. Take a seat. Let the pulls decide.</p></div><button class="battle-button primary" data-battle-action="builder">${icon('plus')}Create battle</button></div>
      <div class="battle-intro"><p>Play with friends, or call a bot to fill the table. Winners receive the cards in their collection.</p><span>Virtual coins only</span></div>
      <div class="battle-list-tools"><div class="battle-word-tabs" role="group" aria-label="Filter battles">${[['lobby','Waiting'],['running','Live'],['finished','Finished'],['all','All battles']].map(([v,t]) => `<button class="${listTab === v ? 'selected' : ''}" aria-pressed="${listTab === v}" data-battle-tab="${v}">${t}</button>`).join('')}</div><button class="battle-button quiet" data-battle-action="refresh" aria-label="Refresh battles">${icon('refresh')}Refresh</button></div>
      ${notice()}<div class="battle-list" aria-label="Battles">${busy && !listing.length ? skeleton() : rows.length ? rows.map(listRow).join('') : `<div class="battle-empty"><span class="battle-empty-mark">${icon('users')}</span><h2>${listTab === 'lobby' ? 'The next table is yours.' : listTab === 'running' ? 'No battles are live right now.' : 'No battles here yet.'}</h2><p>${listTab === 'lobby' ? 'Build a lineup from the full pack shop, then invite your friends.' : 'Create a battle, or check back for a new table.'}</p><button class="battle-button" data-battle-action="builder">Create a battle</button></div>`}</div>
      <details class="battle-how"><summary>How pack battles work</summary><div><p>Each player pays the same entry cost in virtual coins. All players open the same lineup, with pulls generated on the server using the shop’s pack odds.</p><p>Standard awards the cards to the highest score. Crazy awards them to the lowest score. Shared distributes them across everyone. Tied winners and winning teammates share the cards, balanced by pull value; individual cards cannot be divided.</p><p>Fast speeds up the reveal. Skip commons hides common and energy cards in the animation; their value still counts and the full pulls remain in the receipt. Bots are paid for by the host. A bot can win; its cards are discarded, never transferred to the host.</p></div></details>`;
  }
  function skeleton() {return `<div class="battle-loading" role="status">${[1,2,3].map(() => '<div class="battle-skeleton"><span></span><span></span><span></span></div>').join('')}<p>Finding the tables…</p></div>`;}
  function listRow(b) {
    const count = b.seats?.length || 0, s = b.settings || options;
    const names = (b.seats || []).map(p => p.bot ? `${p.name} (bot)` : p.name).join(', ');
    return `<a href="/battles/${esc(b.id)}" class="battle-list-row" data-battle-link="/battles/${esc(b.id)}"><div class="battle-row-lineup">${(b.lineup || []).slice(0,4).map(p => thumb(p)).join('')}${(b.lineup || []).length > 4 ? `<span class="battle-overflow">+${b.lineup.length - 4}</span>` : ''}</div><div class="battle-row-copy"><strong>${esc((b.lineup || []).map(p => `${p.quantity > 1 ? `${p.quantity} × ` : ''}${p.name}`).join(', ') || 'Pack battle')}</strong><span>${esc(rulesLine(s))}</span></div><div class="battle-row-seats"><span>${icon('users')}${count}/${s.players}</span><small title="${esc(names)}">${esc(names || 'Open seats')}</small></div><div class="battle-row-cost">${coin(b.entryCost)}<small>per player</small></div><span class="battle-row-status ${b.status === 'running' ? 'live' : ''}">${b.status === 'lobby' ? 'Join table' : b.status === 'running' ? 'Watch live' : b.status === 'cancelled' ? 'Cancelled' : 'View result'}</span></a>`;
  }

  function renderBuilder() {
    root.innerHTML = `<div class="battle-page-head"><div><button class="battle-back" data-battle-action="list">${icon('back')}All battles</button><h1>Build your battle</h1><p>A single pack or a whole box. Make the lineup yours.</p></div></div>${notice()}
      <div class="battle-builder"><section class="battle-shelf" aria-labelledby="battle-products-heading"><div class="battle-section-head"><h2 id="battle-products-heading">Choose products</h2><span>${catalog.length} in the shop</span></div><label class="battle-search">${icon('search')}<input type="search" placeholder="Search sets, packs and products" value="${esc(search)}" data-battle-search aria-label="Search products" autocomplete="off"/></label><div class="battle-word-tabs" role="group" aria-label="Product type">${[['all','All products'],['packs','Packs'],['sealed','Sealed'],['promo','Promo only']].map(([v,t]) => `<button class="${category === v ? 'selected' : ''}" aria-pressed="${category === v}" data-battle-category="${v}">${t}</button>`).join('')}</div><div class="battle-product-grid" id="battle-product-grid">${productGrid()}</div></section>
      <aside class="battle-lineup" aria-labelledby="battle-lineup-heading"><div class="battle-section-head"><h2 id="battle-lineup-heading">Your lineup</h2><span id="battle-round-count">${rounds()} rounds</span></div><div id="battle-lineup-list">${lineupList()}</div><div class="battle-cost-summary"><span>Entry per player</span><strong id="battle-entry-cost">${coin(total())}</strong></div><p class="battle-lineup-note">Everyone opens the same lineup in this order.</p></aside></div>
      <section class="battle-settings" aria-labelledby="battle-settings-heading"><div class="battle-section-head"><h2 id="battle-settings-heading">Set the rules</h2><span>Make every round count</span></div><div class="battle-settings-grid">
      <fieldset class="battle-setting"><legend>Players</legend><div class="battle-segments">${[[2,'1v1'],[3,'3 players'],[4,'4 players'],['teams','2v2']].map(([v,t]) => `<button type="button" data-battle-setting="players" data-value="${v}" aria-pressed="${v === 'teams' ? settings.teams : !settings.teams && settings.players === v}">${t}</button>`).join('')}</div><p>Real players, with optional bots for open seats.</p></fieldset>
      <fieldset class="battle-setting"><legend>Who takes the cards?</legend><div class="battle-rule-options">${[['standard','Standard','Highest score wins'],['crazy','Crazy','Lowest score wins'],['shared','Shared','Everyone shares']].map(([v,t,d]) => `<button data-battle-setting="mode" data-value="${v}" aria-pressed="${settings.mode === v}"><b>${t}</b><small>${d}</small></button>`).join('')}</div></fieldset>
      <div class="battle-setting"><label for="battle-scoring">Scoring</label><select id="battle-scoring" data-battle-select="scoring">${[['total','Total pull value'],['last','Last round decides'],['best','Single best card']].map(([v,t]) => `<option value="${v}" ${settings.scoring === v ? 'selected' : ''}>${t}</option>`).join('')}</select><p id="battle-score-note">${scoreNote()}</p></div>
      <fieldset class="battle-setting battle-switches"><legend>Reveal style</legend>${switchRow('fast','Fast battle','A quicker, synchronized reveal.')}${switchRow('skipCommons','Skip commons','Hide common and energy cards. Every card still scores.')}</fieldset>
      <fieldset class="battle-setting"><legend>Visibility</legend><div class="battle-segments"><button data-battle-setting="private" data-value="false" aria-pressed="${!settings.private}">Public</button><button data-battle-setting="private" data-value="true" aria-pressed="${settings.private}">Unlisted</button></div><p>Unlisted battles are open to anyone with the invite link.</p></fieldset>
      <div class="battle-rules-note"><h3>Keep it friendly.</h3><p>Virtual coins, real pulls in your collection. Entry is refunded if the lobby is cancelled or you leave before it starts. The host pays each bot’s entry. Bots can win, and their winnings are discarded.</p></div></div></section>
      <div class="battle-builder-footer"><div><strong>${coin(total())}<span> per player</span></strong><p id="battle-create-note">${createNote()}</p></div><button class="battle-button primary" data-battle-action="create" ${busy || !lineup.length || rounds() > limits.maxRounds || packCount() > limits.maxPacks ? 'disabled' : ''}>${busy ? 'Creating battle…' : signed() ? 'Create battle' : 'Sign in to create'}${icon('plus')}</button></div>`;
  }
  function scoreNote() {return settings.scoring === 'last' ? 'Only the final round’s value decides the winner. All rounds’ cards are awarded.' : settings.scoring === 'best' ? 'Your highest-value single card is your score.' : 'The value of every card adds to your score.';}
  function createNote() {return !lineup.length ? 'Add a product to get started.' : rounds() > limits.maxRounds || packCount() > limits.maxPacks ? `Limit: ${limits.maxPacks} packs and ${limits.maxRounds} rounds per battle.` : signed() && balance() < total() ? `You need ${coins(total() - balance())} more coins to enter.` : `${itemCount()} products / ${rounds()} rounds. Your entry is charged when you create.`;}
  function switchRow(key,title,copy) {return `<label class="battle-switch-row"><span><b>${title}</b><small>${copy}</small></span><input type="checkbox" data-battle-toggle="${key}" ${settings[key] ? 'checked' : ''}/><span class="battle-switch" aria-hidden="true"></span></label>`;}
  function productGrid() {
    const q = search.toLocaleLowerCase().trim();
    const filtered = catalog.filter(p => (!q || `${p.name} ${p.setName}`.toLocaleLowerCase().includes(q)) && (category === 'all' || category === 'packs' && p.productId === 'boosterPack' || category === 'sealed' && p.productId !== 'boosterPack' && p.packs > 0 || category === 'promo' && !p.packs));
    if (!catalog.length) return `<p class="battle-product-empty" role="status">Loading the product shelf…</p>`;
    if (!filtered.length) return `<p class="battle-product-empty">No products match. Try another set or product name.</p>`;
    return filtered.slice(0, productLimit).map(p => `<button class="battle-product ${selected(p.key) ? 'in-lineup' : ''}" data-battle-add="${esc(p.key)}" aria-label="Add ${esc(p.name)}, ${coins(p.price)} coins"><span class="battle-product-stage">${art(p.image, '', '', true, wrapperArt.get(p.setId))}<span class="battle-product-add">${selected(p.key) ? `<b>${selected(p.key)}</b>` : icon('plus')}</span></span><span class="battle-product-copy"><small>${esc(p.setName)}</small><strong>${esc(p.name)}</strong><span>${productLabel(p)}</span>${coin(p.price)}</span></button>`).join('') + (filtered.length > productLimit ? `<button class="battle-button battle-load-more" data-battle-action="more">Show more products (${filtered.length - productLimit})</button>` : '');
  }
  function lineupList() {return lineup.length ? `<ol>${lineup.map((p,i) => `<li>${thumb(p)}<div class="battle-lineup-copy"><b>${esc(p.name)}</b><small>${esc(p.setName)}</small>${coin(p.price * p.quantity)}</div><div class="battle-quantity"><button data-battle-quantity="${esc(p.key)}" data-delta="-1" aria-label="${p.quantity === 1 ? 'Remove' : 'Remove one'} ${esc(p.name)}">${icon(p.quantity === 1 ? 'close' : 'minus')}</button><span>${p.quantity}</span><button data-battle-quantity="${esc(p.key)}" data-delta="1" aria-label="Add one ${esc(p.name)}">${icon('plus')}</button></div><div class="battle-reorder"><button data-battle-reorder="${i}" data-delta="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} earlier">Earlier</button><button data-battle-reorder="${i}" data-delta="1" ${i === lineup.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} later">Later</button></div></li>`).join('')}</ol>` : `<div class="battle-lineup-empty"><span>${icon('plus')}</span><p>Your first round starts here.</p><small>Pick anything from the shelf.</small></div>`;}
  function refreshBuilder() {
    const focus = document.activeElement;
    root.querySelector('#battle-product-grid').innerHTML = productGrid();
    root.querySelector('#battle-lineup-list').innerHTML = lineupList();
    root.querySelector('#battle-round-count').textContent = `${rounds()} rounds`;
    root.querySelector('#battle-entry-cost').innerHTML = coin(total());
    root.querySelector('.battle-builder-footer strong').innerHTML = `${coin(total())}<span> per player</span>`;
    root.querySelector('#battle-create-note').textContent = createNote();
    root.querySelector('[data-battle-action="create"]').disabled = busy || !lineup.length || rounds() > limits.maxRounds || packCount() > limits.maxPacks;
    if (focus?.dataset.battleQuantity) root.querySelector(`[data-battle-quantity="${CSS.escape(focus.dataset.battleQuantity)}"][data-delta="${focus.dataset.delta}"]`)?.focus({preventScroll:true});
  }
  function changeQuantity(key,delta) {
    const p = catalog.find(p => p.key === key);if (!p) return;
    const current = lineup.find(row => row.key === key);
    if (delta > 0 && (rounds() + Number(p.rounds ?? p.packs ?? 1) > limits.maxRounds || packCount() + Number(p.packs || 0) > limits.maxPacks)) {report(`A battle can contain up to ${limits.maxPacks} packs and ${limits.maxRounds} rounds.`);return;}
    if (current) current.quantity += delta;else if (delta > 0) lineup.push({...p,quantity:1});
    lineup = lineup.filter(row => row.quantity > 0);requestId = uuid();refreshBuilder();
  }

  async function fetchList(force = false) {
    const token = generation;busy = true;if (!listing.length) renderList();
    try {const data = await api('/api/battles');if (token !== generation || !visible) return;updateClock(data);listing = data.battles || [];error = '';const key = JSON.stringify(listing);if (force || key !== listKey || !root.querySelector('.battle-list-row')) {listKey = key;busy = false;renderList();}}
    catch(e) {if (token !== generation) return;error = failure(e);busy = false;renderList();}
    finally {if (token === generation) {busy = false;timer = setTimeout(() => {if (visible && route === '/battles' && !document.hidden) fetchList();},5000);}}
  }
  async function fetchDetail(initial = false) {
    const token = generation, id = routeId(), sequence = ++detailSequence, actor = idOf(getUser?.());if (!id || id === 'new') return;
    try {
      const data = await api(`/api/battles/${encodeURIComponent(id)}`);
      if (token !== generation || sequence !== detailSequence || !visible) return;updateClock(data);networkError = '';error = '';await save(data,actor);
      const next = data.battle;if (!next) throw new Error('This battle could not be found.');
      const key = JSON.stringify(next);battle = next;
      if (key !== detailKey || initial) {detailKey = key;renderDetail();}
      else {root.querySelector('.battle-connection')?.remove();updateCountdown();}
      if (battle.status === 'finished' && savedFinish !== `${actor}:${battle.id}` && actor && String(actor) === String(idOf(getUser?.())) && userSeat()) {savedFinish = `${actor}:${battle.id}`;await onRefreshSave?.();}
    } catch(e) {
      if (token !== generation || sequence !== detailSequence || !visible) return;
      if (!battle) {error = failure(e);renderDetail();}
      else {networkError = 'Connection interrupted. Reconnecting automatically…';if (!root.querySelector('.battle-connection')) root.querySelector('.battle-table-head')?.insertAdjacentHTML('beforebegin', `<p class="battle-connection" role="status">${esc(networkError)} <button data-battle-action="retry">Retry now</button></p>`);}
    } finally {if (token === generation && sequence === detailSequence && visible && battle?.status !== 'cancelled' && (battle?.status !== 'finished' || networkError)) timer = setTimeout(() => {if (!document.hidden) fetchDetail();},battle?.status === 'running' ? 1200 : 3500);}
  }

  function renderDetail() {
    const disclosure = new Map([...root.querySelectorAll('[data-battle-disclosure]:not(.battle-receipt)')].map(el => [el.dataset.battleDisclosure,el.open]));
    for (const [key,open] of manualReceipts) disclosure.set(key,open);
    const focusedDisclosure = document.activeElement?.parentElement?.dataset.battleDisclosure;
    stopMotion();
    if (!battle) {root.innerHTML = `<button class="battle-back" data-battle-action="list">${icon('back')}All battles</button>${error ? notice() : `<div class="battle-detail-loading" role="status">${skeleton()}<p>Setting the table…</p></div>`}`;return;}
    const b = battle, s = b.settings, me = userSeat(), isHost = host(), finished = b.status === 'finished', cancelled = b.status === 'cancelled';
    const roundIndex = replayIndex !== null ? replayIndex : Math.max(0,(b.rounds?.length || 1) - 1);
    const round = b.rounds?.[roundIndex], plan = b.plan?.[roundIndex] || b.plan?.[0];
    const showFinal = finished && replayIndex === null;
    root.innerHTML = `<div class="battle-detail-nav"><button class="battle-back" data-battle-action="list">${icon('back')}All battles</button><div><span class="battle-id">Battle ${esc(b.id.slice(0,8))}</span><button class="battle-button quiet" data-battle-action="share">${icon('copy')}Invite link</button></div></div>
      <div class="battle-table-head"><div><h1>${cancelled ? 'Battle cancelled' : showFinal ? resultTitle() : b.status === 'lobby' ? 'The table is open.' : 'Let the pulls decide.'}</h1><p>${esc(rulesLine(s))} <span class="battle-live-label ${b.status === 'running' ? 'live' : ''}">${replayIndex !== null ? 'Replay' : b.status === 'lobby' ? `${b.seats.length}/${s.players} seated` : b.status === 'running' ? 'Live battle' : showFinal ? 'Complete' : 'Refunded'}</span></p></div><div class="battle-entry"><span>Entry per player</span><strong>${coin(b.entryCost)}</strong></div></div>
      ${notice()}${networkError ? `<p class="battle-connection" role="status">${esc(networkError)}</p>` : ''}
      ${cancelled ? `<div class="battle-cancelled"><h2>Everyone’s entry has been refunded.</h2><p>Start a new table with the same packs, or build something different.</p><button class="battle-button" data-battle-action="rematch">Use this lineup</button></div>` : `
      <div class="battle-product-strip" aria-label="Battle lineup">${(b.lineup || []).map(p => `<span class="battle-strip-product">${thumb(p)}<span><b>${esc(p.name)}</b><small>${p.quantity} × ${coin(p.price)}</small></span></span>`).join('')}</div>
      <div class="battle-round-head"><div>${plan ? thumb(plan) : ''}<span><b>${b.status === 'lobby' ? `${b.roundCount} rounds ready to open` : esc(plan?.productName || 'Opening packs')}</b><small>${b.status === 'lobby' ? esc(rulesCopy(s)) : `${esc(plan?.setName || '')} / Round ${roundIndex + 1} of ${b.roundCount}${s.skipCommons ? ' / Commons still count' : ''}`}</small></span></div><span class="battle-countdown" role="status" aria-live="off"></span></div>
      ${s.teams ? teamScores(round,showFinal) : ''}<div class="battle-arena players-${s.players}${s.teams ? ' team-battle' : ''}${showFinal ? ' is-finished' : ''}" aria-label="Player lanes">${Array.from({length:s.players},(_,i) => seatLane(i,round,showFinal)).join('')}</div>
      <div class="battle-action-bar">${battleActions(me,isHost,showFinal)}<p>${b.status === 'lobby' ? `${isHost ? 'Fill every seat to start. You pay the entry for each bot you call.' : me ? 'You’re in. The host starts when every seat is filled.' : 'Take a seat to enter. Your coins are refunded if you leave before the start.'}` : showFinal ? 'Every pull is recorded below. Cards are delivered automatically.' : 'Reveals follow the server clock. You can leave this page and return.'}</p></div>
      ${showFinal ? allocationReceipt() : ''}${b.rounds?.length ? pullLog(replayIndex === null ? b.rounds.length : replayIndex + 1) : `<div class="battle-receipt-empty"><span>Pull receipt</span><p>Every card and its value will appear here as rounds are revealed.</p></div>`}
      <details class="battle-how" data-battle-disclosure="rules"><summary>Battle rules and settings</summary><div><p>${esc(rulesCopy(s))} ${esc(scoreLabel(s.scoring))} decides the score. ${s.teams ? 'Teammates combine their scores. Winning teammates share the cards.' : ''}</p><p>${s.fast ? 'Fast reveal is enabled.' : 'Standard reveal speed.'} ${s.skipCommons ? 'Commons and energy cards are hidden from the animation, but still count toward scores and are included in the awards.' : 'Every card is included in the scoring.'} ${s.private ? 'Unlisted: anyone with the invite link can join or watch.' : 'Public: this battle is listed in the lobby.'}</p><p>Bots use the same odds as players. The host pays their entry. Bot winnings are discarded. Shared battles and ties balance the cards by pull value; individual cards cannot be divided.</p></div></details>`}`;
    root.querySelectorAll('[data-battle-disclosure]').forEach(el => {if(disclosure.has(el.dataset.battleDisclosure)) el.open = disclosure.get(el.dataset.battleDisclosure);});
    if(focusedDisclosure) root.querySelector(`[data-battle-disclosure="${CSS.escape(focusedDisclosure)}"] > summary`)?.focus({preventScroll:true});
    updateCountdown();clearInterval(clockTimer);if (b.status === 'running') clockTimer = setInterval(updateCountdown,250);
    if (round) {const animate = !showFinal && lastAnimatedRound !== roundIndex;lastAnimatedRound = roundIndex;animateRound(round,s.fast,animate);}
    if (showFinal && motion()) root.querySelectorAll('.battle-winner-flag').forEach(el => {const a = el.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});animations.add(a);a.onfinish = () => animations.delete(a);});
  }
  function teamScores(round,finished) {
    const scores = finished ? battle.result?.scores || [] : round?.scores || [];
    return `<div class="battle-team-scores" aria-label="Combined team scores">${[[0,1],[2,3]].map((seats,team) => `<div><span><b>Team ${team + 1}</b><small>${seats.map(i => esc(battle.seats.find(s => s.seat === i)?.name || `Open seat ${i + 1}`)).join(' + ')}</small></span><strong>${coin(seats.reduce((sum,i) => sum + Number(scores[i] || 0),0))}</strong></div>`).join('')}</div>`;
  }
  function resultTitle() {
    if (battle.settings.mode === 'shared') return 'Everyone takes a share.';
    const winners = battle.winners || battle.result?.winners || [], names = winners.map(i => battle.seats.find(s => s.seat === i)?.name || 'Player');
    if (battle.settings.teams && winners.length) return `Team ${Number(battle.seats.find(s => s.seat === winners[0])?.team || 0) + 1} takes the cards.`;
    if (names.length === 1) return `${names[0]} takes the cards.`;
    return 'A tie. Share the pulls.';
  }
  function seatLane(i,round,finished) {
    const seat = battle.seats.find(p => p.seat === i), pull = round?.pulls?.find(p => p.seat === i), me = seat && !seat.bot && String(seat.userId) === String(idOf(getUser?.()));
    const winners = battle.winners || battle.result?.winners || [], winner = finished && winners.includes(i);
    const allCards = pull?.cards || [], cards = allCards.filter(c => !battle.settings.skipCommons || !['Common','Energy'].includes(c.rarity) && !c.energy);
    const best = (cards.length ? cards : allCards).slice().sort((a,b) => b.value - a.value)[0];
    const score = finished ? battle.result?.scores?.[i] : round?.scores?.[i];
    const team = seat?.team ?? Math.floor(i / 2);
    return `<section class="battle-lane ${!seat ? 'open' : ''}${winner ? ' winner' : ''}${me ? ' your-lane' : ''}" data-battle-lane="${i}" aria-label="${esc(seat?.name || `Open seat ${i + 1}`)}"><div class="battle-lane-head"><span class="battle-avatar">${seat?.bot ? icon('bot') : seat ? esc((seat.name || 'P').slice(0,1)) : icon('users')}</span><div><strong>${esc(seat?.name || 'Open seat')}${me ? '<small>You</small>' : ''}</strong><span>${battle.settings.teams ? `Team ${team + 1} / ` : ''}${seat?.bot ? 'Bot' : seat ? `@${esc(seat.handle || 'trainer')}` : `Seat ${i + 1}`}</span></div>${winner ? `<span class="battle-winner-flag">${icon('check')}${battle.settings.mode === 'shared' ? 'Shared' : 'Winner'}</span>` : ''}</div>
      <div class="battle-card-stage">${!seat ? `<div class="battle-open-seat"><span>${icon('users')}</span><p>Room for one more.</p>${battle.status === 'lobby' && !userSeat() ? `<button class="battle-button" data-battle-action="join" data-seat="${i}">${signed() ? 'Take this seat' : 'Sign in to join'}</button>` : ''}${battle.status === 'lobby' && host() ? `<button class="battle-button quiet" data-battle-action="bot" data-seat="${i}">${icon('bot')}Call a bot</button><small>Host pays ${coin(battle.entryCost)}</small>` : ''}</div>` : best ? `<div class="battle-reel-viewport"><div class="battle-reel" data-reel="${i}">${(cards.length ? cards : [best]).filter(c => c !== best).slice(-7).concat([best]).map(c => `<div class="battle-reel-card">${art(imageOf(c), c.name, 'battle-scan', false)}</div>`).join('')}</div></div><div class="battle-card-caption"><b>${esc(best.name)}</b><span>${esc(best.rarity || '')}${best.reverse ? ' / Reverse' : ''}</span>${coin(best.value)}</div>` : `<div class="battle-waiting-card">${art(battle.plan?.[0]?.image)}<span>${battle.status === 'lobby' ? 'Ready to rip.' : 'Opening together…'}</span></div>`}</div>
      <div class="battle-lane-score"><span>${battle.settings.scoring === 'best' ? 'Best card score' : battle.settings.scoring === 'last' ? 'Last round score' : 'Total score'}</span><strong class="battle-score-number" data-score="${i}" data-value="${Number(score || 0)}">${coin(score)}</strong>${pull ? `<small>This round ${coin(pull.value)} / ${allCards.length} cards${battle.settings.skipCommons && allCards.length > cards.length ? ` / ${allCards.length - cards.length} hidden` : ''}</small>` : `<small>${seat ? 'Every pull counts.' : 'Waiting for a player'}</small>`}</div></section>`;
  }
  function battleActions(me,isHost,finished) {
    if (finished) return `<div><button class="battle-button primary" data-battle-action="rematch">Build another battle</button><button class="battle-button" data-battle-action="replay">${icon('play')}${replayIndex !== null ? 'Stop replay' : 'Replay battle'}</button></div>`;
    if (battle.status !== 'lobby') return '';
    const empty = battle.settings.players - battle.seats.length;
    return `<div>${!me ? `<button class="battle-button primary" data-battle-action="join" ${battle.seats.length >= battle.settings.players ? 'disabled' : ''}>${signed() ? `Join for ${coins(battle.entryCost)} coins` : 'Sign in to join'}</button>` : isHost ? `<button class="battle-button primary" data-battle-action="start" ${battle.seats.length < battle.settings.players ? 'disabled' : ''}>${icon('play')}Start battle</button>` : `<button class="battle-button" data-battle-action="leave">Leave and refund ${coins(battle.entryCost)}</button>`}${isHost && empty > 0 ? `<button class="battle-button" data-battle-action="fill">${icon('bot')}Fill ${empty} seat${empty === 1 ? '' : 's'} with bots (${coins(empty * battle.entryCost)} coins)</button>` : ''}${isHost ? '<button class="battle-button quiet" data-battle-action="cancel">Cancel and refund everyone</button>' : ''}</div>`;
  }
  function allocationReceipt() {
    const awarded = battle.result?.allocations || [];
    // The same deterministic deal is used by the Worker. Only expose a card-by-card
    // receipt when its counts and cents agree with the authoritative settlement.
    let verified = [];
    try {
      const calculated = battleResult(battle.rounds,battle.settings,battle.seats).allocations;
      if(awarded.length === calculated.length && awarded.every(a => calculated.some(c => c.seat === a.seat && c.cardCount === a.cardCount && Math.round(c.value * 100) === Math.round(a.value * 100)))) verified = calculated;
    } catch { /* Server allocation totals remain available without a derived list. */ }
    return `<section class="battle-awards" aria-labelledby="battle-awards-heading"><div><h2 id="battle-awards-heading">Where the cards landed</h2><p>Cards balanced by pull value. Individual cards cannot be divided.</p></div><div class="battle-award-list">${awarded.map(row => {const seat = battle.seats.find(s => s.seat === row.seat), cards = verified.find(a => a.seat === row.seat)?.cards;return `<details class="battle-award" data-battle-disclosure="award-${row.seat}"><summary><b>${esc(seat?.name || 'Player')}${seat?.bot ? '<small>Bot / discarded</small>' : '<small>Added to collection</small>'}</b><span>${row.cardCount} cards</span>${coin(row.value)}</summary>${cards ? `<ul class="battle-awarded-cards">${cards.map(c => `<li>${art(c.imageSmall || c.image,c.name)}<span><b>${esc(c.name)}</b><small>${esc(c.rarity || '')}${c.reverse ? ' / Reverse' : ''}</small></span>${coin(c.value)}</li>`).join('')}</ul>` : '<p>The server has confirmed the award totals above.</p>'}</details>`;}).join('')}</div></section>`;
  }
  function pullLog(visibleRounds) {
    const shown = battle.rounds.slice(0,visibleRounds);
    return `<section class="battle-receipts" aria-labelledby="battle-pull-log"><div class="battle-section-head"><h2 id="battle-pull-log">Every pull, accounted for.</h2><span>${shown.length} of ${battle.roundCount} rounds</span></div>${shown.map((r,idx) => `<details class="battle-receipt" data-battle-disclosure="round-${idx}" ${idx === shown.length - 1 ? 'open' : ''}><summary><span>Round ${idx + 1}<b>${esc(battle.plan?.[idx]?.productName || 'Pack')}</b></span><span>${coin(r.pulls.reduce((sum,p) => sum + p.value,0))}<small>all players</small></span></summary><div class="battle-pull-columns">${r.pulls.map(p => `<div><h3>${esc(battle.seats.find(s => s.seat === p.seat)?.name || 'Player')}<span>${coin(p.value)}</span></h3><ul>${p.cards.map(c => `<li>${art(c.imageSmall || c.image,c.name)}<span><b>${esc(c.name)}</b><small>${esc(c.rarity || '')}${c.reverse ? ' / Reverse' : ''}${c.energy ? ' / Energy' : ''}</small></span>${coin(c.value)}</li>`).join('')}</ul></div>`).join('')}</div></details>`).join('')}</section>`;
  }
  function updateCountdown() {
    const el = root.querySelector('.battle-countdown');if (!el || !battle) return;
    if (replayIndex !== null) {el.textContent = 'Replaying the pulls';return;}
    if (battle.status === 'lobby') {el.textContent = `${battle.seats.length}/${battle.settings.players} ready`;return;}
    if (battle.status === 'finished') {el.textContent = `${battle.roundCount} rounds complete`;return;}
    const start = Number(battle.startsAt || 0), revealed = battle.rounds?.length || 0;
    const target = now() < start ? start : start + (revealed + 1) * battle.roundMs;
    const seconds = Math.max(0,Math.ceil((target - now()) / 1000));
    el.textContent = now() < start ? `Starting in ${seconds}s` : seconds ? `Next reveal in ${seconds}s` : 'Revealing…';
  }
  function animateRound(round,fast,animate = true) {
    const duration = fast ? 450 : 1450;
    root.querySelectorAll('.battle-reel').forEach(el => {
      const last = el.lastElementChild, distance = last ? last.offsetTop - el.firstElementChild.offsetTop : 0;
      el.style.transform = `translateY(-${distance}px)`;
      if (animate && motion() && distance && typeof el.animate === 'function') {const a = el.animate([{transform:'translateY(0)',filter:'blur(2px)'},{filter:'blur(0)',offset:.75},{transform:`translateY(-${distance}px)`,filter:'blur(0)'}],{duration,easing:'cubic-bezier(.16,1,.3,1)'});animations.add(a);a.onfinish = () => animations.delete(a);}
    });
    if (!animate || !motion()) return;
    root.querySelectorAll('.battle-score-number').forEach(el => {
      const end = Number(el.dataset.value), index = Number(el.dataset.score), previous = battle.rounds?.[round.index - 1]?.scores?.[index] || 0;
      const began = performance.now();
      let frameId;
      const frame = t => {actions.delete(frameId);if (!el.isConnected || !visible || document.hidden) return;const f = Math.min(1,(t - began)/duration), eased = 1 - Math.pow(1-f,4);el.innerHTML = coin(previous + (end - previous) * eased);if(f < 1) {frameId = requestAnimationFrame(frame);actions.add(frameId);}else el.innerHTML = coin(end);};
      frameId = requestAnimationFrame(frame);actions.add(frameId);
    });
  }

  async function perform(action,body = {}) {
    if (busy) return;
    if (!signed()) {onSignIn?.();return;}
    busy = true;error = '';root.querySelectorAll('[data-battle-action]').forEach(el => {if(['create','join','bot','fill','start','leave','cancel'].includes(el.dataset.battleAction)) el.disabled = true;});
    const token = generation, actor = idOf(getUser?.());detailSequence++;clearTimeout(timer);
    try {
      let data;
      if (action === 'create') {data = await api('/api/battles',{method:'POST',body:JSON.stringify({requestId,lineup:lineup.map(({key,quantity}) => ({key,quantity})),settings})});}
      else {data = await api(`/api/battles/${encodeURIComponent(battle.id)}/${action}`,{method:'POST',body:JSON.stringify(body)});}
      await save(data,actor);if (token !== generation || String(actor) !== String(idOf(getUser?.()))) return;updateClock(data);busy = false;
      if (action === 'create') {requestId = uuid();navigate(`/battles/${data.battle.id}`);}
      else {battle = data.battle;detailKey = '';renderDetail();if(action === 'leave') report('You left the battle. Your entry was refunded.');if(action === 'cancel') report('Battle cancelled. Every entry was refunded.');clearTimeout(timer);fetchDetail();}
    } catch(e) {if (token !== generation) return;error = failure(e);if(e.status === 401) onSignIn?.();busy = false;if(route === '/battles/new') renderBuilder();else renderDetail();}
    finally {if (token === generation) busy = false;}
  }
  async function fillBots() {
    if (busy || !host()) return;
    const empty = Array.from({length:battle.settings.players},(_,i) => i).filter(i => !battle.seats.some(p => p.seat === i));
    if (balance() < empty.length * battle.entryCost) {error = `Calling ${empty.length} bots costs ${coins(empty.length * battle.entryCost)} coins. Your balance is ${coins(balance())}.`;renderDetail();return;}
    for (const seat of empty) {await perform('bot',{seat});if(error || !visible || battle?.status !== 'lobby') break;}
  }
  function replay() {
    clearTimeout(replayTimer);stopMotion();
    if (replayIndex !== null) {replayIndex = null;renderDetail();return;}
    replayIndex = 0;lastAnimatedRound = -1;renderDetail();
    const advance = () => {if (!visible || document.hidden) return;if(replayIndex >= battle.rounds.length - 1) {replayIndex = null;renderDetail();return;}replayIndex++;renderDetail();replayTimer = setTimeout(advance,battle.settings.fast ? 1000 : 2400);};
    replayTimer = setTimeout(advance,battle.settings.fast ? 1000 : 2400);
  }
  async function show(path = '/battles') {
    const next = path.replace(/\/$/,'') || '/battles';
    if (visible && route === next) {if(next === '/battles/new') refreshBuilder();return;}
    visible = true;route = next;generation++;clearTimers();manualReceipts.clear();busy = false;error = '';networkError = '';battle = null;detailKey = '';replayIndex = null;lastAnimatedRound = -1;
    if (route === '/battles/new') {
      renderBuilder();const token = generation;
      try {await loadCatalog();if(token === generation && visible) renderBuilder();}catch(e) {if(token === generation) {error = `The product shelf could not load. ${failure(e)}`;renderBuilder();}}
    } else if (route === '/battles') {listKey = '';renderList();fetchList();}
    else {renderDetail();fetchDetail(true);}
  }
  function hide() {visible = false;generation++;clearTimers();replayIndex = null;}

  root.addEventListener('click',async event => {
    const receiptSummary = event.target.closest('.battle-receipt > summary');
    if (receiptSummary) {const details = receiptSummary.parentElement;manualReceipts.set(details.dataset.battleDisclosure,!details.open);}
    const link = event.target.closest('[data-battle-link]');if(link) {if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;event.preventDefault();navigate(link.dataset.battleLink);return;}
    const add = event.target.closest('[data-battle-add]');if(add) {changeQuantity(add.dataset.battleAdd,1);return;}
    const qty = event.target.closest('[data-battle-quantity]');if(qty) {changeQuantity(qty.dataset.battleQuantity,Number(qty.dataset.delta));return;}
    const reorder = event.target.closest('[data-battle-reorder]');if(reorder) {const i = Number(reorder.dataset.battleReorder), j = i + Number(reorder.dataset.delta);[lineup[i],lineup[j]] = [lineup[j],lineup[i]];requestId = uuid();refreshBuilder();return;}
    const filter = event.target.closest('[data-battle-category]');if(filter) {category = filter.dataset.battleCategory;productLimit = 48;root.querySelectorAll('[data-battle-category]').forEach(el => {const selected = el === filter;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});root.querySelector('#battle-product-grid').innerHTML = productGrid();return;}
    const tab = event.target.closest('[data-battle-tab]');if(tab) {listTab = tab.dataset.battleTab;renderList();return;}
    const setting = event.target.closest('[data-battle-setting]');if(setting) {const key = setting.dataset.battleSetting,v = setting.dataset.value;if(key === 'players') {settings.players = v === 'teams' ? 4 : Number(v);settings.teams = v === 'teams';}else settings[key] = key === 'private' ? v === 'true' : v;requestId = uuid();root.querySelectorAll(`[data-battle-setting="${key}"]`).forEach(el => el.setAttribute('aria-pressed',String(key === 'players' ? el.dataset.value === 'teams' ? settings.teams : !settings.teams && Number(el.dataset.value) === settings.players : String(settings[key]) === el.dataset.value)));return;}
    const button = event.target.closest('[data-battle-action]');if(!button || button.disabled) return;
    const action = button.dataset.battleAction;
    if(action === 'builder') navigate('/battles/new');
    else if(action === 'list') navigate('/battles');
    else if(action === 'refresh' || action === 'retry') {clearTimeout(timer);if(route === '/battles/new') {error = '';renderBuilder();try{await loadCatalog();renderBuilder();}catch(e){error = failure(e);renderBuilder();}}else if(route === '/battles') fetchList(true);else fetchDetail(true);}
    else if(action === 'more') {productLimit += 48;root.querySelector('#battle-product-grid').innerHTML = productGrid();}
    else if(action === 'share') {try {await navigator.clipboard.writeText(`${location.origin}/battles/${battle.id}`);button.innerHTML = `${icon('check')}Link copied`;report('Battle invite link copied.');}catch {error = `Copy this invite link: ${location.origin}/battles/${battle.id}`;renderDetail();}}
    else if(action === 'rematch') {lineup = (battle.lineup || []).map(p => ({...p}));settings = {...options,...battle.settings};requestId = uuid();navigate('/battles/new');}
    else if(action === 'replay') replay();
    else if(action === 'fill') fillBots();
    else if(['create','join','bot','start','leave','cancel'].includes(action)) perform(action,button.dataset.seat !== undefined ? {seat:Number(button.dataset.seat)} : {});
  });
  root.addEventListener('input',event => {if(event.target.matches('[data-battle-search]')) {search = event.target.value;productLimit = 48;root.querySelector('#battle-product-grid').innerHTML = productGrid();}});
  root.addEventListener('change',event => {const el = event.target;if(el.dataset.battleToggle) settings[el.dataset.battleToggle] = el.checked;if(el.dataset.battleSelect) {settings[el.dataset.battleSelect] = el.value;root.querySelector('#battle-score-note').textContent = scoreNote();}requestId = uuid();});
  document.addEventListener('visibilitychange',() => {if(!visible) return;if(document.hidden) {clearTimers();replayIndex = null;}else {if(route === '/battles') fetchList(true);else if(route !== '/battles/new') {lastAnimatedRound = -1;fetchDetail(true);}}});
  root.addEventListener('error',event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.battleFallback;
    delete img.dataset.battleFallback;
    if (fallback && img.getAttribute('src') !== fallback) {img.src = fallback;return;}
    img.classList.add('battle-image-failed');img.alt = 'Artwork unavailable';
  },true);
  return {show,hide,path:'/battles'};
}
