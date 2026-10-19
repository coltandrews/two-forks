// The office: end-of-day P&L, menu design and pricing, supplier orders,
// upgrades, marketing, the layout editor, and save codes.
import { CFG } from '../config.js';
import { ING, stateInfo, statesOf } from '../data/ingredients.js';
import { CUISINES, BUILDER } from '../data/cuisines.js';
import { UPGRADES, MARKETING } from '../data/upgrades.js';
import { STATION_NAMES } from '../data/layout.js';
import { allDishes, dishById, drinkById, dishCost, courseSlot, menuLimits, menuIngredients, WEEKDAYS, dishVeg } from '../sim/state.js';
import {
  stockCount, casePrice, pendingCases, autofillPlan, expectedParties, upgradeStatus, rateCustom, classTip, avgRating, forecastDishes, placementStatus,
} from '../sim/economy.js';
import { footprint } from '../sim/world.js';
import { esc } from './overlay.js';
import { money, money0, stars } from './hud.js';
import { sfx } from '../audio.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const pct = (v) => (v * 100).toFixed(0) + '%';
const TABS = [['report', 'Report'], ['menu', 'Menu'], ['supplier', 'Supplier'], ['upgrades', 'Upgrades'], ['layout', 'Layout'], ['house', 'Restaurant']];

export class Office {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('office');
    this.tab = 'report';
    this.open = false;
    this.layoutMode = false;
    this.drag = null;
    this.draft = { name: '', course: 'main', tpl: 'burger', comps: [] };
    this.showAllIngs = false;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
  }

  show(state, tab) {
    this.open = true;
    if (tab) this.tab = tab;
    if (!state.report && this.tab === 'report' && state.phase === 'morning') this.tab = 'menu';
    this.root.hidden = false;
    this.render(state, true);
  }

  hide() {
    this.open = false;
    this.stopLayout(false);
    this.root.hidden = true;
  }

  startLayout(state) {
    this.layoutMode = true;
    this.drag = null;
    this.root.classList.add('layout-mode');
    document.body.classList.add('layout-planning');
    this.app.layoutSel = null;
    this.app.view.setLayoutMode(true, state);
    this.render(state, true);
  }

  stopLayout(render = true) {
    this.layoutMode = false;
    this.drag = null;
    this.root.classList.remove('layout-mode');
    document.body.classList.remove('layout-planning');
    this.app.layoutSel = null;
    this.app.view.setLayoutMode(false, this.state);
    if (render && this.state) this.render(this.state, true);
  }

  update(state) {
    if (!this.open) return;
    this.render(state, false);
  }

  render(state, force) {
    this.state = state;
    if (this.layoutMode) { this.renderLayoutBar(state, force); return; }
    const sig = this.sigFor(state);
    if (!force && sig === this.lastSig) return;
    const active = document.activeElement;
    if (!force && active && this.root.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
    this.lastSig = sig;
    const scroll = this.root.querySelector('.office-body');
    const top = scroll ? scroll.scrollTop : 0;
    this.root.innerHTML = `<div class="office">
      <div class="office-head"><div><h1>${esc(state.name)}</h1><div class="meta">${CUISINES[state.cuisine].style} · Day ${state.day} · ${WEEKDAYS[(state.day - 1) % 7]} · ${state.phase === 'office' ? 'after hours' : 'morning'}</div></div>
        <div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="office-body">${this.body(state)}</div>
      <div class="office-foot">${this.foot(state)}</div></div>`;
    const nb = this.root.querySelector('.office-body');
    if (nb && !force) nb.scrollTop = top;
  }

  sigFor(state) {
    return JSON.stringify([this.tab, state.phase, state.day, state.cash, state.menu, state.custom, state.orders, state.upgrades, state.marketing, state.ready, Object.keys(state.players), state.rep.level,
      this.tab === 'supplier' ? state.stock : 0, this.draft, this.showAllIngs, state.report ? state.report.day : 0, state.layoutRev]);
  }

  foot(state) {
    const self = this.app.selfPid;
    const others = Object.values(state.players).filter((p) => p.id !== self);
    const ready = !!state.ready[self];
    let who = '';
    if (others.length) who = state.ready[others[0].id] ? `${esc(others[0].name)} is ready` : `${esc(others[0].name)} is still looking around`;
    if (state.phase === 'office') {
      const pending = state.orders.reduce((s, o) => s + o.cases, 0);
      return `<span class="cash">${money(state.cash)}</span><span class="who">${pending ? `${pending} case${pending > 1 ? 's' : ''} arriving tomorrow` : '<b class="neg">Nothing ordered for tomorrow yet</b>'}</span><span class="grow"></span><span class="who">${who}</span>
        <button class="btn ${ready ? 'on' : 'primary'}" data-act="ready">${ready ? '✓ Ready (click to undo)' : `Start day ${state.day + 1}`}</button>`;
    }
    return `<span class="cash">${money(state.cash)}</span><span class="grow"></span><button class="btn primary" data-act="close">Back to the kitchen</button>`;
  }

  body(state) {
    switch (this.tab) {
      case 'report': return this.report(state);
      case 'menu': return this.menu(state);
      case 'supplier': return this.supplier(state);
      case 'upgrades': return this.upgrades(state);
      case 'layout': return this.layoutTab(state);
      case 'house': return this.house(state);
    }
    return '';
  }

  // ------------------------------------------------------------ report

  report(state) {
    const r = state.report;
    if (!r) return '<div class="empty">No service yet. Your first P&L shows up here after closing.</div>';
    const line = (label, v, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="${v < 0 ? 'neg' : ''}">${money(v)}</td></tr>`;
    const f = r.fixed;
    const pl = `<table class="pl">
      ${line('<b>Revenue</b>', r.revenue)}${line('Food', r.foodRev, 'sub')}${line('Drinks', r.drinkRev, 'sub')}
      ${line('<b>Cost of goods sold</b>', -r.cogs)}${line('Food ingredients', -r.cogsFood, 'sub')}${line('Drinks', -r.cogsDrink, 'sub')}
      ${line('Gross profit', r.gross, 'total')}
      ${line('<b>Waste</b>', -r.waste)}${line('Thrown away', -r.wasteParts.binned, 'sub')}${line('Spoiled overnight', -r.wasteParts.spoiled, 'sub')}${line('Left out at closing', -r.wasteParts.cleanup, 'sub')}
      ${line('<b>Running costs</b>', -r.fixedTotal)}${line('Rent', -f.rent, 'sub')}${line('Equipment loan', -f.loan, 'sub')}${line('Utilities', -f.utilities, 'sub')}${line('Card fees (3%)', -f.cardFees, 'sub')}${line('Napkins and supplies', -f.supplies, 'sub')}${f.cleaning ? line('Dishwashing service (unwashed plates)', -f.cleaning, 'sub') : ''}
      <tr class="net"><td>Net profit</td><td class="${r.net >= 0 ? 'pos' : 'neg'}">${money(r.net)}</td></tr></table>`;
    const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
    const kpis = `<div class="kpis">${kpi(r.covers, 'Guests')}${kpi(money(r.avgCheck), 'Avg check / guest')}${kpi(r.foodCostPct + '%', 'Food cost')}${kpi(r.rating ? r.rating.toFixed(1) + '★' : '–', 'Avg rating')}
      ${kpi(r.ticketTime ? Math.floor(r.ticketTime / 60) + ':' + String(r.ticketTime % 60).padStart(2, '0') : '–', 'Avg ticket time')}${kpi(r.walkouts, 'Walkouts')}${kpi(r.turnedAway, 'Turned away')}${kpi((r.repGain >= 0 ? '+' : '') + Math.round(r.repGain), 'Reputation')}</div>`;
    const hist = state.history.slice(-14);
    const maxAbs = Math.max(1, ...hist.map((h) => Math.abs(h.net)));
    const spark = `<div class="spark">${hist.map((h) => `<i class="${h.net < 0 ? 'neg' : ''}" title="Day ${h.day}: ${money(h.net)}" style="height:${Math.max(3, (Math.abs(h.net) / maxAbs) * 100)}%"></i>`).join('')}</div>`;
    const tipsToday = Object.entries(r.tips || {}).sort((a, b) => b[1] - a[1]);
    const jar = Object.entries(state.tipJar || {}).sort((a, b) => b[1] - a[1]);
    const reviews = state.reviews.filter((x) => x.day === r.day).slice(0, 12);
    const me = r.menu.filter((m) => m.n || true);
    const meRows = ['main', 'starter', 'dessert'].map((slot) => {
      const g = me.filter((m) => m.course === slot);
      if (!g.length) return '';
      return `<tr><th colspan="6">${slot === 'starter' ? 'Starters & sides' : slot + 's'}</th></tr>` + g.map((m) => `<tr><td>${esc(m.name)}</td><td class="n">${m.n}</td><td class="n">${money(m.price)}</td><td class="n">${money(m.cost)}</td><td class="n">${money(m.cm)}</td><td><span class="cls ${m.cls}" title="${esc(classTip(m.cls))}">${m.cls}</span></td></tr>`).join('');
    }).join('');
    const spoiled = (r.spoiled || []).length ? `<div class="tip">Spoiled this morning: ${r.spoiled.map((s) => `${s.n} ${ING[s.ing].name.toLowerCase()}${s.well ? ' (prep well)' : ''}`).join(', ')}</div>` : '';
    return `${kpis}<div class="cols2">
      <div class="card receipt"><h3>Day ${r.day} · Profit &amp; Loss</h3>${pl}<div class="tip" style="margin-top:8px">Cash on hand ${money(r.cashEnd)}. Groceries bought today: ${money(r.purchases)} (counted as cost only when cooked and sold, or wasted).</div>${spoiled}</div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card"><h3>Net profit, last ${hist.length} day${hist.length > 1 ? 's' : ''}</h3>${spark}</div>
        <div class="card"><h3>Reviews</h3><div class="reviews">${reviews.length ? reviews.map((v) => `<div class="review ${v.critic ? 'critic' : ''}"><span class="st">${'★'.repeat(v.stars)}${'☆'.repeat(5 - v.stars)}</span> ${esc(v.text)} <span class="who">${esc(v.name)}${v.critic ? ', food critic' : ''}</span></div>`).join('') : '<div class="tip">No reviews today.</div>'}</div></div>
        <div class="card"><h3>Tip jar</h3>${tipsToday.length ? tipsToday.map(([n, v]) => `<div>${esc(n)}: <b>${money(v)}</b> today</div>`).join('') : '<div class="tip">Tips go to whoever settles the bill.</div>'}${jar.length ? `<div class="tip">All time: ${jar.map(([n, v]) => `${esc(n)} ${money(v)}`).join(' · ')}</div>` : ''}</div>
      </div></div>
      <div class="card" style="margin-top:14px"><h3>Menu engineering</h3><div class="tip" style="margin-bottom:6px">Popularity is compared to a fair share of orders (70% rule); profit is each dish's margin against the average. Hover a tag for advice.</div>
      <table class="me"><tr><th>Dish</th><th>Sold</th><th>Avg price</th><th>Food cost</th><th>Margin</th><th>Class</th></tr>${meRows}</table></div>`;
  }

  // ------------------------------------------------------------ menu

  menu(state) {
    const lim = menuLimits(state);
    const used = { main: 0, starter: 0, dessert: 0 };
    for (const m of state.menu.dishes) if (m.on) used[courseSlot(dishById(state, m.id).course)]++;
    const sold = (state.report && state.report.menu) || [];
    const row = (m) => {
      const d = dishById(state, m.id);
      const cost = dishCost(d);
      const fc = cost / m.price;
      const locked = d.level > state.rep.level;
      const s = sold.find((x) => x.id === m.id);
      return `<div class="mrow ${m.on ? '' : 'off'} ${locked ? 'locked' : ''}">
        <button class="toggle ${m.on ? 'on' : ''}" data-act="toggle" data-id="${m.id}" ${locked ? 'disabled' : ''} title="${locked ? 'Unlocks at reputation level ' + d.level : m.on ? 'Take off the menu' : 'Put on the menu'}"></button>
        <div class="nm">${esc(d.name)}${d.custom ? ' <span class="cls Puzzle">House</span>' : ''}${dishVeg(d) ? ' <span title="Vegetarian">🌱</span>' : ''} <span class="appeal" title="Appeal">${'★'.repeat(Math.round(d.appeal / 2))}</span><small>${locked ? `Unlocks at reputation level ${d.level}` : d.comps.map(([i, st]) => stateInfo(i, st).label.toLowerCase()).join(' · ')}</small></div>
        <div class="price"><button data-act="price" data-id="${m.id}" data-d="-1">−</button><input type="number" step="0.5" min="1" max="99" value="${m.price.toFixed(2)}" data-price="${m.id}"><button data-act="price" data-id="${m.id}" data-d="1">+</button></div>
        <div class="n">${money(cost)}<br><span class="fc ${fc > 0.38 ? 'hi' : ''}">${pct(fc)} cost</span></div>
        <div class="n" title="What guests think it's worth">fair ${money0(d.fair)}</div>
        <div class="n">${s ? s.n + ' sold' : ''}${d.custom ? `<br><button class="icon-btn" data-act="deldish" data-id="${m.id}" title="Delete this house dish">🗑</button>` : ''}</div></div>`;
    };
    const group = (slot, title) => {
      const items = state.menu.dishes.filter((m) => courseSlot(dishById(state, m.id).course) === slot);
      return `<div class="section-title">${title} · ${used[slot]}/${lim[slot]} on the menu</div><div class="menu-list">${items.map(row).join('')}</div>`;
    };
    const drinks = state.menu.drinks.map((m) => {
      const d = drinkById(state, m.id);
      return `<div class="mrow ${m.on ? '' : 'off'}"><button class="toggle ${m.on ? 'on' : ''}" data-act="dtoggle" data-id="${m.id}"></button><div class="nm">${esc(d.name)}</div>
        <div class="price"><button data-act="dprice" data-id="${m.id}" data-d="-0.5">−</button><input type="number" step="0.5" min="1" max="99" value="${m.price.toFixed(2)}" data-dprice="${m.id}"><button data-act="dprice" data-id="${m.id}" data-d="0.5">+</button></div>
        <div class="n">${money(d.cost)}<br><span class="fc">${pct(d.cost / m.price)} cost</span></div><div class="n">fair ${money0(d.price)}</div><div></div></div>`;
    }).join('');
    return `<div class="tip">Guests compare your price with what they think a dish is worth ("fair"). Charge more and fewer people order it, and fewer people come in at all. Food cost around 25 to 35% is healthy.</div>
      <div class="mhead" style="margin-top:10px"><span>On</span><span>Dish</span><span>Price</span><span>Food cost</span><span>Value</span><span></span></div>
      ${group('main', 'Mains')}${group('starter', 'Starters & sides')}${group('dessert', 'Desserts')}
      <div class="section-title">Drinks</div><div class="menu-list">${drinks}</div>
      ${this.builder(state)}`;
  }

  builder(state) {
    const dr = this.draft;
    const tpl = BUILDER[dr.tpl];
    const r = dr.comps.length ? rateCustom(dr.comps) : null;
    const ingOpts = Object.values(ING).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    const kinds = [...new Set(ingOpts.map((i) => i.kind))];
    const sel = this.pickIng || tpl.bases[0][0];
    const states = statesOf(sel);
    const custom = (state.custom || []).length;
    return `<div class="card builder" style="margin-top:16px"><h3>Create a house dish (${custom}/8)</h3>
      <div class="tip" style="margin-bottom:8px">Pick a type, start with its base, then add up to ${tpl.max} components in total. Classic pairings (bacon + cheddar, avocado + lime, salmon + teriyaki…) make guests like it more. Every ingredient can be ordered from the supplier.</div>
      <div class="row"><input type="text" placeholder="Dish name" maxlength="28" value="${esc(dr.name)}" data-draft="name">
        <select data-draft="course">${['main', 'starter', 'side', 'dessert'].map((c) => `<option ${dr.course === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select data-draft="tpl">${Object.entries(BUILDER).map(([k, b]) => `<option value="${k}" ${dr.tpl === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
      <div class="row"><select data-pick="ing">${kinds.map((k) => `<optgroup label="${k}">${ingOpts.filter((i) => i.kind === k).map((i) => `<option value="${i.id}" ${sel === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('')}</select>
        <select data-pick="st">${states.filter((s) => s !== 'burnt').map((s) => `<option value="${s}">${esc(stateInfo(sel, s).label)}</option>`).join('')}</select>
        <button class="btn small" data-act="addcomp" ${dr.comps.length >= tpl.max ? 'disabled' : ''}>Add</button>
        <span class="hint-line">Base: ${tpl.bases.map(([i, s]) => esc(stateInfo(i, s).label.toLowerCase())).join(' or ')}</span></div>
      <div class="chips">${dr.comps.map(([i, s], k) => `<span class="chip2"><span class="sw" style="background:${hex(stateInfo(i, s).color)}"></span>${esc(stateInfo(i, s).label)}<button data-act="rmcomp" data-k="${k}">✕</button></span>`).join('') || '<span class="hint-line">No components yet.</span>'}</div>
      ${r ? `<div class="preview"><span>Ingredient cost <b>${money(r.cost)}</b></span><span>Guests would pay <b>${money0(r.fair)}</b></span><span>Appeal <b>${r.appeal}/9</b></span><span>Pairings <b>${r.pairs}</b></span></div>` : ''}
      <button class="btn primary" data-act="create" ${dr.comps.length < 2 ? 'disabled' : ''}>Add to the dish list</button></div>`;
  }

  // ------------------------------------------------------------ supplier

  supplier(state) {
    const players = Math.max(1, Object.keys(state.players).length);
    const parties = expectedParties(state, state.day + (state.phase === 'office' ? 1 : 0), players);
    const plan = autofillPlan(state, players);
    const forecast = forecastDishes(state, parties * 1.0);
    const used = new Set(menuIngredients(state));
    const need = {};
    for (const [id, n] of Object.entries(forecast)) for (const [ing] of dishById(state, id).comps) need[ing] = (need[ing] || 0) + n;
    const ings = Object.values(ING).filter((i) => used.has(i.id) || this.showAllIngs || stockCount(state, i.id) > 0 || pendingCases(state, i.id) > 0);
    ings.sort((a, b) => (used.has(b.id) - used.has(a.id)) || a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
    const tomorrow = state.phase === 'office' ? state.day + 1 : state.day;
    const rows = ings.map((i) => {
      const n = stockCount(state, i.id);
      const exp = (state.stock[i.id] || []).filter((l) => l.exp < tomorrow + 1).reduce((s, l) => s + l.n, 0);
      const pend = pendingCases(state, i.id);
      const needN = Math.ceil(need[i.id] || 0);
      const short = used.has(i.id) && n + pend * i.case - exp < needN;
      return `<tr class="${used.has(i.id) ? 'used' : ''}"><td><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${hex(i.look.color)}"></span> ${esc(i.name)}</td>
        <td>${STATION_NAMES[i.store]}</td><td class="n">${n}${exp ? ` <span class="exp">(${exp} spoil soon)</span>` : ''}</td><td class="n ${short ? 'short' : ''}">${needN || ''}</td>
        <td class="n">${i.case} · ${i.keep}d</td><td class="n">${money(casePrice(i.id))}</td>
        <td><span class="qty"><button data-act="order" data-ing="${i.id}" data-d="-1" ${pend ? '' : 'disabled'}>−</button><b>${pend}</b><button data-act="order" data-ing="${i.id}" data-d="1">+</button></span></td>
        <td class="n">${pend ? money(pend * casePrice(i.id)) : ''}</td></tr>`;
    }).join('');
    const total = state.orders.reduce((s, o) => s + o.cases * casePrice(o.ing), 0);
    const planCost = plan.reduce((s, p) => s + p.cases * casePrice(p.ing), 0);
    return `<div class="cols2" style="grid-template-columns:1fr auto;align-items:center">
      <div><div class="card"><b>Forecast for ${state.phase === 'office' ? 'tomorrow' : 'today'}:</b> about ${Math.round(parties)} parties (${Math.round(parties * 2.35)} guests) on a ${WEEKDAYS[(tomorrow - 1) % 7]}. Orders arrive on the pallet by the back door the next morning. Fresh food spoils; check the shelf life column.</div></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><button class="btn primary" data-act="autofill" ${plan.length ? '' : 'disabled'}>${plan.length ? `Auto-fill ${plan.length} items · ${money(planCost)}` : 'Storage covers the forecast'}</button>
      <span class="hint-line">Tonight's order: <b>${money(total)}</b></span></div></div>
      <table class="sup" style="margin-top:12px"><tr><th>Ingredient</th><th>Kept in</th><th>In stock</th><th>Need</th><th>Case · keeps</th><th>Per case</th><th>Order</th><th>Cost</th></tr>${rows}</table>
      <button class="btn small ghost" style="margin-top:10px" data-act="allings">${this.showAllIngs ? 'Show only what the menu uses' : 'Show every ingredient (for house dishes)'}</button>`;
  }

  // ------------------------------------------------------------ upgrades

  upgrades(state) {
    const card = (u) => {
      const n = state.upgrades[u.id] || 0;
      const st = upgradeStatus(state, u);
      return `<div class="up ${n >= u.max ? 'maxed' : ''}"><h4>${esc(u.name)}<span>${money0(u.price)}</span></h4><p>${esc(u.desc)}</p>
        <div class="owned">${u.max > 1 ? `Owned ${n}/${u.max}` : n ? 'Owned' : ''}</div>
        <button class="btn small ${st.can ? 'primary' : ''}" data-act="buy" data-id="${u.id}" ${st.can ? '' : 'disabled'}>${st.can ? 'Buy' : esc(st.reason)}</button></div>`;
    };
    const mk = MARKETING.map((m) => {
      const running = state.marketing && state.marketing.days > 0;
      return `<div class="up"><h4>${esc(m.name)}<span>${money0(m.price)}</span></h4><p>+${Math.round(m.boost * 100)}% guests for ${m.days} day${m.days > 1 ? 's' : ''}, starting with the next service.</p>
        <button class="btn small ${!running && state.cash >= m.price ? 'primary' : ''}" data-act="market" data-id="${m.id}" ${running || state.cash < m.price ? 'disabled' : ''}>${running ? 'Campaign running' : 'Run it'}</button></div>`;
    }).join('');
    const kitchen = UPGRADES.filter((u) => u.group === 'Kitchen').map(card).join('');
    const dining = UPGRADES.filter((u) => u.group === 'Dining room').map(card).join('');
    return `<div class="tip">New stations and tables are placed automatically. Rearrange them in the Layout tab. Every heat station adds $${CFG.money.utilityPerStation} a day to utilities.</div>
      <div class="section-title">Kitchen</div><div class="ups">${kitchen}</div>
      <div class="section-title">Dining room</div><div class="ups">${dining}</div>
      <div class="section-title">Marketing${state.marketing ? ` · ${esc(state.marketing.name)}: ${state.marketing.days} day${state.marketing.days > 1 ? 's' : ''} left` : ''}</div><div class="ups">${mk}</div>`;
  }

  // ------------------------------------------------------------ layout

  layoutTab(state) {
    return `<div class="card"><h3>Redesign the restaurant</h3><p>Drag any station, pass, table, or service item to a cell. You can use the full floor. The grid will show if the new place is safe. Doors and walls stay fixed.</p>
      <button class="btn primary" data-act="layout">Open floor planner</button></div>`;
  }

  renderLayoutBar(state, force) {
    const sel = this.app.layoutSel;
    const o = sel && state.objects.find((x) => x.id === sel);
    const html = `<div class="panel layout-bar"><p>${o ? `Move <b>${esc(STATION_NAMES[o.type] || o.type)}</b>${o.type === 'table' ? ` ${o.num}` : ''}. Drag it, or click a cell to place it.` : 'Drag any item to a grid cell. Green means valid.'}</p>
      ${o ? '<button class="btn small ghost" data-act="unsel">Cancel</button>' : ''}<button class="btn small primary" data-act="layoutdone">Done</button></div>`;
    if (!force && html === this.lastBar) return;
    this.lastBar = html;
    this.root.innerHTML = html;
  }

  // ------------------------------------------------------------ restaurant

  house(state) {
    const c = CUISINES[state.cuisine];
    const host = this.app.session.role !== 'client';
    const L = state.lifetime;
    return `<div class="cols2"><div class="card"><h3>${esc(state.name)}</h3><p>${esc(c.style)}. ${esc(c.blurb)}</p>
      <p>Open ${L.days} day${L.days === 1 ? '' : 's'} · ${L.guests} guests served · ${money0(L.revenue)} lifetime revenue · best day ${money(L.bestDay)}</p>
      <p>Average rating ${avgRating(state) ? avgRating(state).toFixed(2) + '★' : '–'} · Reputation level ${state.rep.level}</p>
      <button class="btn" data-act="chef">Change my chef</button></div>
      <div class="card"><h3>Save</h3>${host ? `<p>The game saves on this laptop after every day. A save code is a backup you can paste into any browser (Host → Import a save code).</p><button class="btn" data-act="code">Show save code</button>` : '<p>Your partner\'s laptop keeps the save. Only the host can export it.</p>'}</div></div>`;
  }

  // ------------------------------------------------------------ events

  onClick(e) {
    const b = e.target.closest('[data-tab],[data-act]');
    if (!b) return;
    const s = this.state;
    if (b.dataset.tab) { this.tab = b.dataset.tab; sfx('ui'); this.render(s, true); return; }
    const a = b.dataset.act;
    const cmd = (c) => this.app.command(c);
    switch (a) {
      case 'ready': cmd({ c: 'ready', on: !s.ready[this.app.selfPid] }); break;
      case 'close': this.app.closeOffice(); break;
      case 'toggle': { const m = s.menu.dishes.find((x) => x.id === b.dataset.id); cmd({ c: 'toggle', id: b.dataset.id, on: !m.on }); break; }
      case 'dtoggle': { const m = s.menu.drinks.find((x) => x.id === b.dataset.id); cmd({ c: 'toggle', id: b.dataset.id, on: !m.on, drink: true }); break; }
      case 'price': { const m = s.menu.dishes.find((x) => x.id === b.dataset.id); cmd({ c: 'price', id: m.id, price: m.price + +b.dataset.d }); break; }
      case 'dprice': { const m = s.menu.drinks.find((x) => x.id === b.dataset.id); cmd({ c: 'price', id: m.id, price: m.price + +b.dataset.d, drink: true }); break; }
      case 'deldish': if (confirm('Delete this house dish?')) cmd({ c: 'deldish', id: b.dataset.id }); break;
      case 'addcomp': {
        const ing = this.root.querySelector('[data-pick=ing]').value, st = this.root.querySelector('[data-pick=st]').value;
        if (this.draft.comps.length < BUILDER[this.draft.tpl].max) this.draft.comps.push([ing, st]);
        this.render(s, true);
        break;
      }
      case 'rmcomp': this.draft.comps.splice(+b.dataset.k, 1); this.render(s, true); break;
      case 'create': {
        cmd({ c: 'dish', spec: { ...this.draft } });
        this.app.toastSoon('Added to the dish list. Switch it on to put it on the menu.');
        this.draft = { name: '', course: this.draft.course, tpl: this.draft.tpl, comps: [] };
        break;
      }
      case 'order': cmd({ c: 'order', ing: b.dataset.ing, cases: +b.dataset.d }); break;
      case 'autofill': cmd({ c: 'autofill' }); break;
      case 'allings': this.showAllIngs = !this.showAllIngs; this.render(s, true); break;
      case 'buy': cmd({ c: 'upgrade', id: b.dataset.id }); break;
      case 'market': cmd({ c: 'marketing', id: b.dataset.id }); break;
      case 'layout': this.startLayout(s); break;
      case 'layoutdone': this.stopLayout(); break;
      case 'unsel': this.drag = null; this.app.layoutSel = null; this.app.view.setLayoutSelection(s, null); this.app.view.clearLayoutPreview(); this.render(s, true); break;
      case 'chef': this.app.editChef(); break;
      case 'code': this.app.showSaveCode(); break;
    }
    sfx('ui');
    setTimeout(() => this.render(this.app.session.state, false), 120);
  }

  onChange(e) {
    const t = e.target;
    const s = this.state;
    if (t.dataset.price) this.app.command({ c: 'price', id: t.dataset.price, price: +t.value });
    if (t.dataset.dprice) this.app.command({ c: 'price', id: t.dataset.dprice, price: +t.value, drink: true });
    if (t.dataset.draft === 'course') this.draft.course = t.value;
    if (t.dataset.draft === 'tpl') { this.draft.tpl = t.value; this.pickIng = BUILDER[t.value].bases[0][0]; this.render(s, true); }
    if (t.dataset.pick === 'ing') { this.pickIng = t.value; this.render(s, true); }
    if (t.dataset.price || t.dataset.dprice) { t.blur(); setTimeout(() => this.render(this.app.session.state, true), 150); }
  }

  onInput(e) {
    const t = e.target;
    if (t.dataset.draft === 'name') this.draft.name = t.value;
  }

  objectAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    return this.state.objects.find((o) => {
      const f = footprint(o);
      return tx >= f.x && tx < f.x + f.w && tz >= f.z && tz < f.z + f.h;
    });
  }

  floorPointerDown(x, z, pointerId) {
    const hit = this.objectAt(x, z);
    const o = hit || this.state.objects.find((item) => item.id === this.app.layoutSel);
    if (!o) return false;
    const f = footprint(o);
    const onObject = hit && hit.id === o.id;
    this.app.layoutSel = o.id;
    this.drag = {
      id: o.id, pointerId, fromX: o.x, fromZ: o.z, x: o.x, z: o.z,
      grabX: onObject ? Math.floor(x) - f.x : Math.floor((f.w - 1) / 2),
      grabZ: onObject ? Math.floor(z) - f.z : Math.floor((f.h - 1) / 2),
      valid: true, reason: '',
    };
    this.app.view.setLayoutSelection(this.state, o.id);
    this.floorPointerMove(x, z, pointerId);
    this.render(this.state, true);
    sfx('pick');
    return true;
  }

  floorPointerMove(x, z, pointerId) {
    if (!this.drag || this.drag.pointerId !== pointerId) return;
    const nx = Math.floor(x) - this.drag.grabX;
    const nz = Math.floor(z) - this.drag.grabZ;
    if (nx === this.drag.x && nz === this.drag.z) return;
    const status = placementStatus(this.state, this.drag.id, nx, nz);
    Object.assign(this.drag, { x: nx, z: nz, valid: status.ok, reason: status.reason || '' });
    this.app.view.previewLayoutObject(this.state, this.drag.id, nx, nz, status.ok);
  }

  floorPointerUp(x, z, pointerId, cancelled = false) {
    if (!this.drag || this.drag.pointerId !== pointerId) return;
    this.floorPointerMove(x, z, pointerId);
    const drag = this.drag;
    this.drag = null;
    this.app.view.clearLayoutPreview();
    const moved = drag.x !== drag.fromX || drag.z !== drag.fromZ;
    if (!cancelled && moved && drag.valid) {
      this.app.command({ c: 'move', id: drag.id, x: drag.x, z: drag.z });
      this.app.layoutSel = null;
      this.app.view.setLayoutSelection(this.state, null);
      sfx('drop');
    } else {
      this.app.view.setLayoutSelection(this.state, drag.id);
      if (!cancelled && moved && drag.reason) { this.app.hud.toast(drag.reason, 'bad'); sfx('bad'); }
    }
    this.render(this.state, true);
  }
}
