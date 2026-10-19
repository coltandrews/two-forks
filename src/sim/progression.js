import { XP_LEVELS, isStory } from '../data/progression.js';

export function awardXP(state, amount, label) {
  if (!isStory(state) || !Number.isFinite(amount) || amount <= 0) return;
  amount = Math.floor(amount);
  state.xp += amount;
  state.level = XP_LEVELS.reduce((level, at, i) => state.xp >= at ? i + 1 : level, 1);
  state.prestige = Math.floor(Math.max(0, state.xp - XP_LEVELS[19]) / 2000);
  const lines = state.today.xpLines || (state.today.xpLines = []);
  const line = lines.find((l) => l.label === label);
  if (line) line.amount += amount; else lines.push({ label, amount });
  const report = state.report;
  if (state.phase === 'office' && report?.day === state.day && report.progression) {
    report.progression.xp = lines.reduce((total, row) => total + row.amount, 0);
    report.progression.lines = lines.map((row) => ({ ...row }));
    report.progression.level = state.level;
  }
}

export function creditWork(state, pid, kind, amount = 1) {
  if (!isStory(state) || !state.players[pid]) return;
  const all = state.today.contributions || (state.today.contributions = {});
  const row = all[pid] || (all[pid] = { id: pid, name: state.players[pid].name, plated: 0, served: 0, bused: 0 });
  row[kind] += amount;
}

export function paidProgress(state, party) {
  if (!isStory(state) || party.xpPaid) return;
  party.xpPaid = true;
  const served = party.items.filter((x) => x.served && x.price > 0);
  if (!served.length) return;
  const guests = new Set(served.map((x) => x.guest)).size;
  const count = Math.min(party.size, guests);
  state.today.paidGuests = (state.today.paidGuests || 0) + count;
  state.storyStats.paidGuests += count;
  awardXP(state, count * 10, 'Paying guests');
  let quality = 0;
  for (const line of served) {
    const points = Math.max(0, Math.min(5, Math.round((line.q ?? 1) * 3) + (!line.cold ? 1 : 0) + (!line.late ? 1 : 0)));
    quality += points;
    if (!line.cold) state.today.hotPaid = (state.today.hotPaid || 0) + 1;
    if (line.course === 'dessert') state.today.dessertsPaid = (state.today.dessertsPaid || 0) + 1;
  }
  awardXP(state, quality, 'Plate quality');
  updateGoal(state);
}

export function dailyGoal(state) {
  if (!isStory(state)) return null;
  const target = state.chapter >= 3 ? 16 : state.chapter >= 2 ? 12 : 8;
  const choices = [
    { id: 'guests', label: `Serve ${target} paying guests`, target, xp: 40 + (state.chapter - 1) * 10 },
    { id: 'hot', label: `Serve ${target} hot plates that guests pay for`, target, xp: 60 },
    { id: 'walkouts', label: 'Serve 6 paying guests with no walkouts', target: 6, xp: 80 },
  ];
  return { ...choices[(state.day - 1) % choices.length], progress: 0, done: false };
}
export function updateGoal(state) {
  if (!isStory(state) || !state.goal) return;
  const g = state.goal, t = state.today;
  g.progress = g.id === 'hot' ? t.hotPaid || 0 : t.paidGuests || 0;
}
export function finishProgress(state) {
  if (!isStory(state)) return null;
  updateGoal(state);
  const goal = state.goal;
  if (goal && !goal.done && goal.progress >= goal.target && (goal.id !== 'walkouts' || state.today.walkouts === 0)) {
    goal.done = true;
    awardXP(state, goal.xp, 'Daily goal');
  }
  state.storyStats.bestPaidDay = Math.max(state.storyStats.bestPaidDay, state.today.paidGuests || 0);
  state.debtDays = state.cash < 0 ? (state.debtDays || 0) + 1 : 0;
  let relief = 0;
  if (state.debtDays >= 3) {
    // A working-capital loan is recorded as debt, never as sales or profit.
    relief = Math.round((100 - state.cash) * 100) / 100;
    state.debt = Math.round((state.debt + relief) * 100) / 100;
    state.cash = 100;
    state.debtDays = 0;
  }
  return { xp: (state.today.xpLines || []).reduce((n, l) => n + l.amount, 0), lines: (state.today.xpLines || []).map((l) => ({ ...l })), level: state.level, goal: goal ? { ...goal } : null, debtDays: state.debtDays, debt: state.debt, relief };
}
