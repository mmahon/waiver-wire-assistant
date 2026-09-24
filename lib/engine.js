// Pure recommendation logic. No network calls here, so it's easy to test.
//
// League model (produced by espn.js or the mock fixture):
// {
//   season, week, teamCount,
//   slots: [{ key: 'QB', eligible: ['QB'] }, { key: 'FLEX', eligible: ['RB','WR','TE'] }, ...],
//   rosterMax,
//   myTeamId,
//   teams: [{ id, name, waiverRank, roster: [player] }],
//   freeAgents: [player]
// }
// player: { id, name, pos, proTeam, byeWeek, injuryStatus, onIR, status, pctOwned, pctChange, proj: { [week]: pts } }

export const CONFIG = {
  nextWeekWeight: 0.5,     // lookahead: next week counts half
  minGain: 0.5,            // ignore moves worth less than this (weighted points)
  protectOwnedPct: 60,     // never suggest dropping players rostered in >= this % of leagues
  dropPoolSize: 6,         // how many of your lowest-value players are considered as drops
  contestedChange: 3,      // ownership jump (% points) that suggests other managers want him
  contestedOwned: 25,      // or already rostered in this % of leagues
  claimThreshold: { top: 6, middle: 3, back: 1 }, // weighted gain needed to spend a claim, by waiver position
};

const OUT_STATUSES = new Set(['OUT', 'INJURY_RESERVE', 'SUSPENSION']);

// Projected points for a player in a given week, accounting for byes and injuries.
export function projFor(p, week, currentWeek) {
  if (p.onIR) return 0;
  if (p.byeWeek === week) return 0;
  if (week === currentWeek && OUT_STATUSES.has(p.injuryStatus)) return 0;
  if (p.proj && p.proj[week] != null) return p.proj[week];
  // No projection for a future week: fall back to this week's number.
  if (week > currentWeek && p.proj && p.proj[currentWeek] != null) return p.proj[currentWeek];
  return 0;
}

// Greedy optimal lineup: dedicated slots first, flex slots last.
export function bestLineup(players, slots, week, currentWeek) {
  const pool = players
    .map(p => ({ p, pts: projFor(p, week, currentWeek) }))
    .sort((a, b) => b.pts - a.pts);
  const used = new Set();
  const ordered = [...slots.filter(s => s.eligible.length === 1), ...slots.filter(s => s.eligible.length > 1)];
  const counts = {};
  const result = [];
  for (const slot of ordered) {
    counts[slot.key] = (counts[slot.key] || 0) + 1;
    const slotId = `${slot.key}${counts[slot.key]}`;
    const pick = pool.find(x => !used.has(x.p.id) && slot.eligible.includes(x.p.pos));
    if (pick) used.add(pick.p.id);
    result.push({ slotId, pos: slot.key, eligible: slot.eligible, player: pick ? pick.p : null, pts: pick ? pick.pts : 0 });
  }
  return result;
}

const sum = arr => arr.reduce((t, x) => t + x.pts, 0);

export function teamValue(roster, league) {
  const { slots, week } = league;
  const now = sum(bestLineup(roster, slots, week, week));
  const next = sum(bestLineup(roster, slots, week + 1, week));
  return { now, next, weighted: now + CONFIG.nextWeekWeight * next };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Per-slot gap between your lineup and the league-median starter, this week and next.
export function slotGaps(league) {
  const { slots, week, teams, myTeamId } = league;
  const me = teams.find(t => t.id === myTeamId);
  const weeks = [week, week + 1];
  const medians = weeks.map(w => {
    const bySlot = {};
    for (const t of teams) {
      for (const s of bestLineup(t.roster, slots, w, week)) (bySlot[s.slotId] ||= []).push(s.pts);
    }
    return Object.fromEntries(Object.entries(bySlot).map(([k, v]) => [k, median(v)]));
  });
  const mine = weeks.map(w => bestLineup(me.roster, slots, w, week));
  return mine[0].map((s, i) => {
    const nextSlot = mine[1][i];
    const gapNow = medians[0][s.slotId] - s.pts;
    const gapNext = medians[1][s.slotId] - nextSlot.pts;
    return {
      slotId: s.slotId,
      pos: s.pos,
      starterNow: s.player ? s.player.name : null,
      starterNext: nextSlot.player ? nextSlot.player.name : null,
      mineNow: s.pts, mineNext: nextSlot.pts,
      medianNow: medians[0][s.slotId], medianNext: medians[1][s.slotId],
      gapNow, gapNext,
      weightedGap: gapNow + CONFIG.nextWeekWeight * gapNext,
      byeNext: !!(s.player && s.player.byeWeek === week + 1),
    };
  });
}

function waiverTier(rank, teamCount) {
  if (!rank || teamCount < 2) return 'middle';
  const frac = (rank - 1) / (teamCount - 1);
  return frac < 0.2 ? 'top' : frac < 0.6 ? 'middle' : 'back';
}

export function claimOrWait(fa, gain, myRank, teamCount) {
  if (fa.status === 'FREEAGENT') {
    return { call: 'add', label: 'Add now', why: 'free agent, so no claim is needed' };
  }
  const contested = (fa.pctChange ?? 0) >= CONFIG.contestedChange || (fa.pctOwned ?? 0) >= CONFIG.contestedOwned;
  const tier = waiverTier(myRank, teamCount);
  if (!contested) {
    return { call: 'wait', label: 'Wait', why: `unlikely to be claimed, so add him after waivers clear and keep your #${myRank} spot` };
  }
  if (gain >= CONFIG.claimThreshold[tier]) {
    return { call: 'claim', label: 'Claim now', why: `other managers are adding him, and he's worth your #${myRank} spot` };
  }
  return { call: 'wait', label: 'Wait', why: `likely to be claimed, but not worth your #${myRank} spot` };
}

// Find the best add/drop pairs for my team.
export function recommend(league, limit = 3) {
  const { teams, myTeamId, freeAgents, week, rosterMax, teamCount } = league;
  const me = teams.find(t => t.id === myTeamId);
  const base = teamValue(me.roster, league);
  const baseNowLineup = bestLineup(me.roster, league.slots, week, week);
  const valueOf = p => projFor(p, week, week) + CONFIG.nextWeekWeight * projFor(p, week + 1, week);

  // Moves build on each other: after each pick, re-score from the new roster,
  // so two players covering the same hole are never both recommended.
  let roster = [...me.roster];
  let current = base;
  const available = [...freeAgents];
  const picked = [];

  while (picked.length < limit) {
    const droppable = roster
      .filter(p => !p.onIR && (p.pctOwned ?? 0) < CONFIG.protectOwnedPct && !picked.some(x => x.add.id === p.id))
      .sort((a, b) => valueOf(a) - valueOf(b))
      .slice(0, CONFIG.dropPoolSize);
    const dropOptions = roster.filter(p => !p.onIR).length < rosterMax ? [null, ...droppable] : droppable;

    let best = null;
    for (const fa of available) {
      for (const d of dropOptions) {
        const next = [...roster.filter(p => !d || p.id !== d.id), fa];
        const v = teamValue(next, league);
        const gain = v.weighted - current.weighted;
        const better = !best || gain > best.gain + 1e-9 ||
          (Math.abs(gain - best.gain) < 1e-9 && (fa.pctChange ?? 0) > (best.add.pctChange ?? 0));
        if (better) best = { add: fa, drop: d, gain, gainNow: v.now - current.now, gainNext: v.next - current.next, roster: next, value: v };
      }
    }
    if (!best || best.gain < CONFIG.minGain) break;

    // Is one of this week's starters at his position on bye next week?
    const holeNext = baseNowLineup.find(s => s.player && s.eligible.length === 1 && s.eligible[0] === best.add.pos && s.player.byeWeek === week + 1);
    picked.push({
      add: best.add, drop: best.drop, gain: best.gain, gainNow: best.gainNow, gainNext: best.gainNext,
      coversBye: !!(holeNext && holeNext.player && best.gainNext > 0.5),
      byePlayer: holeNext && holeNext.player ? holeNext.player.name : null,
      advice: claimOrWait(best.add, best.gain, me.waiverRank, teamCount),
    });
    roster = best.roster;
    current = best.value;
    available.splice(available.indexOf(best.add), 1);
  }
  // Show the time-sensitive calls first: claims, then free-agent adds, then waits.
  const urgency = { claim: 0, add: 1, wait: 2 };
  picked.sort((a, b) => urgency[a.advice.call] - urgency[b.advice.call] || b.gain - a.gain);
  return { base, recommendations: picked };
}

export function analyze(league) {
  const me = league.teams.find(t => t.id === league.myTeamId);
  if (!me) throw new Error(`Team ${league.myTeamId} was not found in league.`);
  const gaps = slotGaps(league);
  const { base, recommendations } = recommend(league);
  return {
    season: league.season,
    week: league.week,
    team: { id: me.id, name: me.name, waiverRank: me.waiverRank, teamCount: league.teamCount },
    gaps,
    projected: base,
    recommendations,
  };
}
