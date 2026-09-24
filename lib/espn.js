// Fetches league data from ESPN's (unofficial) fantasy API and normalizes it.
// ESPN doesn't document this API, so field names are based on community usage.
// If something comes back empty, hit /api/raw to inspect the actual responses.

const HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

export const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };

// ESPN lineup slot ids -> our slot definitions. Bench (20) and IR (21) are not starting slots.
const SLOT_DEFS = {
  0: { key: 'QB', eligible: ['QB'] },
  2: { key: 'RB', eligible: ['RB'] },
  4: { key: 'WR', eligible: ['WR'] },
  6: { key: 'TE', eligible: ['TE'] },
  16: { key: 'DST', eligible: ['DST'] },
  17: { key: 'K', eligible: ['K'] },
  3: { key: 'FLEX', eligible: ['RB', 'WR'] },
  5: { key: 'FLEX', eligible: ['WR', 'TE'] },
  23: { key: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  7: { key: 'OP', eligible: ['QB', 'RB', 'WR', 'TE'] },
};
const BENCH = 20, IR = 21;

function headers(cookies, filter) {
  const h = { accept: 'application/json' };
  if (cookies?.espnS2 && cookies?.swid) h.cookie = `espn_s2=${cookies.espnS2}; SWID=${cookies.swid}`;
  if (filter) h['x-fantasy-filter'] = JSON.stringify(filter);
  return h;
}

async function get(url, cookies, filter) {
  const res = await fetch(url, { headers: headers(cookies, filter) });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('ESPN refused access: this league is private.');
    err.code = 'PRIVATE';
    throw err;
  }
  if (res.status === 404) {
    const err = new Error('ESPN has no league with that ID for this season.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`);
  return res.json();
}

const faFilter = {
  players: {
    filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
    filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
    limit: 150,
    sortPercOwned: { sortPriority: 1, sortAsc: false },
  },
};

export async function fetchTeams({ leagueId, season, cookies }) {
  const data = await get(`${HOST}/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`, cookies);
  return (data.teams || []).map(t => ({
    id: t.id,
    name: t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`,
  }));
}

export async function fetchRaw({ leagueId, season, cookies }) {
  const base = `${HOST}/seasons/${season}/segments/0/leagues/${leagueId}`;
  const league = await get(`${base}?view=mTeam&view=mRoster&view=mSettings&view=mStatus`, cookies);
  const week = league.scoringPeriodId ?? league.status?.currentMatchupPeriod;
  const [rosterNext, faNow, faNext, proTeams] = await Promise.all([
    get(`${base}?view=mRoster&scoringPeriodId=${week + 1}`, cookies),
    get(`${base}?view=kona_player_info&scoringPeriodId=${week}`, cookies, faFilter),
    get(`${base}?view=kona_player_info&scoringPeriodId=${week + 1}`, cookies, faFilter),
    get(`${HOST}/seasons/${season}?view=proTeamSchedules_wl`, cookies),
  ]);
  return { league, rosterNext, faNow, faNext, proTeams, week };
}

// Weekly projections live in player.stats entries with statSourceId 1 (projected), statSplitTypeId 1 (single week).
function projections(player) {
  const out = {};
  for (const s of player.stats || []) {
    if (s.statSourceId === 1 && s.statSplitTypeId === 1 && s.scoringPeriodId > 0) out[s.scoringPeriodId] = s.appliedTotal ?? 0;
  }
  return out;
}

function toPlayer(raw, byeByTeam, proAbbrev, extra = {}) {
  return {
    id: raw.id,
    name: raw.fullName,
    pos: POSITIONS[raw.defaultPositionId] || 'OTHER',
    proTeam: proAbbrev[raw.proTeamId] || 'FA',
    byeWeek: byeByTeam[raw.proTeamId] ?? null,
    injuryStatus: raw.injuryStatus || 'ACTIVE',
    pctOwned: raw.ownership?.percentOwned ?? 0,
    pctChange: raw.ownership?.percentChange ?? 0,
    proj: projections(raw),
    ...extra,
  };
}

function mergeProj(into, from) {
  for (const [w, v] of Object.entries(from)) if (into[w] == null) into[w] = v;
}

export function normalize({ league, rosterNext, faNow, faNext, proTeams, week }, myTeamId) {
  const byeByTeam = {}, proAbbrev = {};
  for (const t of proTeams.settings?.proTeams || []) {
    byeByTeam[t.id] = t.byeWeek;
    proAbbrev[t.id] = t.abbrev?.toUpperCase();
  }

  // Starting slots from league settings.
  const counts = league.settings?.rosterSettings?.lineupSlotCounts || {};
  const slots = [];
  let rosterMax = 0;
  for (const [id, n] of Object.entries(counts)) {
    const num = Number(id);
    if (num !== IR) rosterMax += n;
    if (num === BENCH || num === IR || !n) continue;
    const def = SLOT_DEFS[num];
    if (!def) continue; // positions we don't model (IDP etc.)
    for (let i = 0; i < n; i++) slots.push(def);
  }

  // Next-week projections for rostered players.
  const nextProj = {};
  for (const t of rosterNext.teams || []) {
    for (const e of t.roster?.entries || []) {
      const p = e.playerPoolEntry?.player;
      if (p) nextProj[p.id] = projections(p);
    }
  }

  const teams = (league.teams || []).map(t => ({
    id: t.id,
    name: t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`,
    waiverRank: t.waiverRank ?? null,
    roster: (t.roster?.entries || [])
      .filter(e => e.playerPoolEntry?.player)
      .map(e => {
        const p = toPlayer(e.playerPoolEntry.player, byeByTeam, proAbbrev, { onIR: e.lineupSlotId === IR });
        mergeProj(p.proj, nextProj[p.id] || {});
        return p;
      }),
  }));

  const faNextById = {};
  for (const x of faNext.players || []) if (x.player) faNextById[x.player.id] = projections(x.player);
  const freeAgents = (faNow.players || [])
    .filter(x => x.player && POSITIONS[x.player.defaultPositionId])
    .map(x => {
      const p = toPlayer(x.player, byeByTeam, proAbbrev, { status: x.status || 'WAIVERS', onIR: false });
      mergeProj(p.proj, faNextById[p.id] || {});
      return p;
    });

  return {
    season: league.seasonId,
    week,
    teamCount: teams.length,
    slots,
    rosterMax,
    myTeamId: Number(myTeamId),
    teams,
    freeAgents,
  };
}
