// A made-up 10-team league for mock mode and tests. Players are fictional.
// Built so "my team" has a thin RB2 and a kicker on bye next week.

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const FIRST = ['Jalen', 'Marcus', 'Trey', 'Devon', 'Cole', 'Isaiah', 'Brock', 'Tyrell', 'Kyle', 'Andre', 'Nico', 'Darius', 'Owen', 'Malik', 'Grant', 'Jace'];
const LAST = ['Hollis', 'Brandt', 'Okafor', 'Pruitt', 'Vance', 'Caldwell', 'Reyes', 'Whitfield', 'Mercer', 'Ashby', 'Lowe', 'Garrison', 'Tate', 'Fontaine', 'Rourke', 'Sutter'];
const TEAMS = ['PIT', 'CLE', 'BAL', 'CIN', 'BUF', 'MIA', 'NYJ', 'NE', 'KC', 'DEN', 'LV', 'LAC', 'DAL', 'PHI', 'NYG', 'WSH'];
const BYES = { PIT: 5, CLE: 9, BAL: 7, CIN: 10, BUF: 7, MIA: 12, NYJ: 9, NE: 14, KC: 10, DEN: 12, LV: 8, LAC: 5, DAL: 10, PHI: 9, NYG: 14, WSH: 12 };
const BASE = { QB: 17, RB: 10, WR: 10, TE: 7, K: 8, DST: 7 };
const WEEK = 4;

let nextId = 1000;
const usedNames = new Set();
function uniqueName() {
  let n;
  do { n = `${FIRST[Math.floor(rand() * 16)]} ${LAST[Math.floor(rand() * 16)]}`; } while (usedNames.has(n));
  usedNames.add(n);
  return n;
}
function player(pos, quality, opts = {}) {
  const proTeam = opts.proTeam || TEAMS[Math.floor(rand() * TEAMS.length)];
  const now = +(BASE[pos] * quality * (0.85 + rand() * 0.3)).toFixed(1);
  const next = +(now * (0.9 + rand() * 0.2)).toFixed(1);
  return {
    id: nextId++,
    name: opts.name || (pos === 'DST' ? `${proTeam} D/ST` : uniqueName()),
    pos, proTeam, byeWeek: BYES[proTeam],
    injuryStatus: 'ACTIVE', onIR: false,
    status: opts.status,
    pctOwned: opts.pctOwned ?? +(quality * 70).toFixed(1),
    pctChange: opts.pctChange ?? +((rand() - 0.5) * 2).toFixed(1),
    proj: { [WEEK]: now, [WEEK + 1]: next },
  };
}

function roster(q) {
  return [
    player('QB', q), player('QB', q * 0.8),
    player('RB', q * 1.2), player('RB', q), player('RB', q * 0.8), player('RB', q * 0.7),
    player('WR', q * 1.2), player('WR', q * 1.05), player('WR', q * 0.9), player('WR', q * 0.75),
    player('TE', q), player('K', q), player('DST', q),
    player('WR', q * 0.6), player('RB', q * 0.6), player('TE', q * 0.6),
  ];
}

export function mockLeague() {
  seed = 42; nextId = 1000; usedNames.clear();
  ['Tyrell Okafor','Grant Lowe','Owen Tate','Kyle Sutter','Nico Ashby','Brock Mercer','Darius Vance','Cole Pruitt','Jace Fontaine','Andre Rourke','Malik Garrison','Isaiah Whitfield'].forEach(n => usedNames.add(n));
  const teams = [];
  const names = ['Matt\'s Squad', 'Gridiron Gurus', 'Blitz Brigade', 'Sunday Funday', 'Fourth & Long', 'Hail Marys', 'End Zone Eleven', 'Pick Six', 'Red Zone Rebels', 'Waiver Wizards'];
  for (let i = 0; i < 10; i++) {
    teams.push({ id: i + 1, name: names[i], waiverRank: [3, 1, 2, 4, 5, 6, 7, 8, 9, 10][i], roster: roster(0.95 + (i % 4) * 0.04) });
  }
  // Shape my team: weak RB depth, kicker on PIT (bye in Week 5), no backup kicker.
  const me = teams[0];
  me.roster = me.roster.filter(p => !['RB', 'K'].includes(p.pos));
  me.roster.push(
    player('RB', 1.2, { name: 'Tyrell Okafor' }), player('RB', 0.55, { name: 'Grant Lowe' }),
    player('RB', 0.45, { name: 'Owen Tate', pctOwned: 12 }), player('RB', 0.4, { name: 'Kyle Sutter', pctOwned: 8 }),
    player('RB', 0.35, { name: 'Nico Ashby', pctOwned: 5 }),
    player('K', 1.0, { name: 'Brock Mercer', proTeam: 'PIT' }),
  );
  const freeAgents = [
    player('RB', 0.95, { name: 'Darius Vance', status: 'WAIVERS', pctOwned: 38, pctChange: 22.5 }),
    player('RB', 0.7, { name: 'Cole Pruitt', status: 'WAIVERS', pctOwned: 9, pctChange: 1.2 }),
    player('K', 0.95, { name: 'Jace Fontaine', proTeam: 'BUF', status: 'WAIVERS', pctOwned: 14, pctChange: 0.4 }),
    player('K', 0.9, { name: 'Andre Rourke', proTeam: 'LV', status: 'FREEAGENT', pctOwned: 6, pctChange: 0.1 }),
    player('WR', 0.8, { name: 'Malik Garrison', status: 'WAIVERS', pctOwned: 30, pctChange: 9.8 }),
    player('TE', 0.7, { name: 'Isaiah Whitfield', status: 'FREEAGENT', pctOwned: 11, pctChange: 0.6 }),
    player('DST', 0.9, { proTeam: 'DAL', status: 'FREEAGENT', pctOwned: 20, pctChange: 2.1 }),
    player('QB', 0.8, { name: 'Trey Holloway', status: 'WAIVERS', pctOwned: 15, pctChange: 0.5 }),
  ];
  const slot = (key, eligible = [key]) => ({ key, eligible });
  return {
    season: 2026, week: WEEK, teamCount: 10,
    slots: [slot('QB'), slot('RB'), slot('RB'), slot('WR'), slot('WR'), slot('TE'), slot('FLEX', ['RB', 'WR', 'TE']), slot('DST'), slot('K')],
    rosterMax: 16,
    myTeamId: 1,
    teams, freeAgents,
  };
}
