import test from 'node:test';
import assert from 'node:assert/strict';
import { projFor, bestLineup, analyze, claimOrWait } from '../lib/engine.js';
import { normalize } from '../lib/espn.js';
import { mockLeague } from '../fixtures/mock.js';

test('bye week projects zero', () => {
  const p = { id: 1, pos: 'K', byeWeek: 5, proj: { 4: 8, 5: 9 } };
  assert.equal(projFor(p, 5, 4), 0);
  assert.equal(projFor(p, 4, 4), 8);
});

test('missing next-week projection falls back to this week', () => {
  const p = { id: 1, pos: 'RB', byeWeek: 12, proj: { 4: 10 } };
  assert.equal(projFor(p, 5, 4), 10);
});

test('OUT players project zero this week only', () => {
  const p = { id: 1, pos: 'WR', byeWeek: 12, injuryStatus: 'OUT', proj: { 4: 10, 5: 11 } };
  assert.equal(projFor(p, 4, 4), 0);
  assert.equal(projFor(p, 5, 4), 11);
});

test('flex is filled after dedicated slots', () => {
  const players = [
    { id: 1, pos: 'RB', proj: { 1: 10 } }, { id: 2, pos: 'RB', proj: { 1: 8 } }, { id: 3, pos: 'WR', proj: { 1: 9 } },
  ];
  const slots = [{ key: 'RB', eligible: ['RB'] }, { key: 'FLEX', eligible: ['RB', 'WR'] }, { key: 'WR', eligible: ['WR'] }];
  const lineup = bestLineup(players, slots, 1, 1);
  assert.equal(lineup.find(s => s.pos === 'RB').player.id, 1);
  assert.equal(lineup.find(s => s.pos === 'WR').player.id, 3);
  assert.equal(lineup.find(s => s.pos === 'FLEX').player.id, 2);
});

test('mock league: covers the kicker bye, and never suggests two kickers', () => {
  const r = analyze(mockLeague());
  const kickers = r.recommendations.filter(x => x.add.pos === 'K');
  assert.equal(kickers.length, 1);
  assert.equal(kickers[0].coversBye, true);
  assert.ok(r.gaps.find(g => g.pos === 'K').byeNext);
});

test('claim or wait', () => {
  assert.equal(claimOrWait({ status: 'FREEAGENT' }, 10, 1, 10).call, 'add');
  assert.equal(claimOrWait({ status: 'WAIVERS', pctChange: 0.2, pctOwned: 5 }, 10, 1, 10).call, 'wait');
  assert.equal(claimOrWait({ status: 'WAIVERS', pctChange: 20, pctOwned: 40 }, 2, 1, 10).call, 'wait');   // top of order, small gain
  assert.equal(claimOrWait({ status: 'WAIVERS', pctChange: 20, pctOwned: 40 }, 2, 10, 10).call, 'claim'); // back of order
});

test('normalize reads ESPN-shaped responses', () => {
  const pl = (id, pos, team, owned, stats) => ({ id, fullName: `P${id}`, defaultPositionId: pos, proTeamId: team, ownership: { percentOwned: owned, percentChange: 1 }, stats });
  const st = (w, v) => ({ scoringPeriodId: w, statSourceId: 1, statSplitTypeId: 1, appliedTotal: v });
  const raw = {
    week: 4,
    league: {
      seasonId: 2026, scoringPeriodId: 4,
      settings: { rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 17: 1, 20: 2, 21: 1, 23: 1, 24: 0 } } },
      teams: [{ id: 1, location: 'Matt', nickname: 'Squad', waiverRank: 3, roster: { entries: [
        { lineupSlotId: 0, playerPoolEntry: { player: pl(1, 1, 23, 90, [st(4, 18)]) } },
        { lineupSlotId: 21, playerPoolEntry: { player: pl(2, 2, 23, 70, [st(4, 0)]) } },
      ] } }],
    },
    rosterNext: { teams: [{ roster: { entries: [{ playerPoolEntry: { player: pl(1, 1, 23, 90, [st(5, 17)]) } }] } }] },
    faNow: { players: [{ status: 'WAIVERS', player: pl(3, 5, 2, 10, [st(4, 8)]) }] },
    faNext: { players: [{ player: pl(3, 5, 2, 10, [st(5, 9)]) }] },
    proTeams: { settings: { proTeams: [{ id: 23, abbrev: 'pit', byeWeek: 5 }, { id: 2, abbrev: 'buf', byeWeek: 7 }] } },
  };
  const L = normalize(raw, '1');
  assert.equal(L.week, 4);
  assert.deepEqual(L.slots.map(s => s.key).sort(), ['FLEX', 'K', 'QB', 'RB', 'RB']);
  assert.equal(L.rosterMax, 7);
  const qb = L.teams[0].roster[0];
  assert.deepEqual(qb.proj, { 4: 18, 5: 17 });
  assert.equal(qb.byeWeek, 5);
  assert.equal(qb.proTeam, 'PIT');
  assert.equal(L.teams[0].roster[1].onIR, true);
  assert.deepEqual(L.freeAgents[0].proj, { 4: 8, 5: 9 });
  assert.equal(L.teams[0].name, 'Matt Squad');
});
