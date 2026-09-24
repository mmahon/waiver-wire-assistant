// Request handling shared by the local server (server.js) and the Netlify Function.
//
// Which league gets analyzed:
//   1. ?league=&team= in the request  -> that public ESPN league (never uses cookies)
//   2. otherwise, if a private league is configured (local .env only) -> that league
//   3. otherwise -> the sample league
// The hosted site never passes a private league, so every visitor starts on the sample.

import { fetchRaw, fetchTeams, normalize } from './espn.js';
import { analyze } from './engine.js';
import { writeReasons } from './reasons.js';
import { mockLeague } from '../fixtures/mock.js';

const defaultSeason = () => Number(process.env.SEASON) || new Date().getFullYear();

export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function readId(value, label) {
  if (value == null || value === '') return null;
  if (!/^\d{1,12}$/.test(String(value))) throw new UserError(`${label} should be a number.`);
  return String(value);
}

function explain(err, isPublicRequest) {
  if (err.code === 'PRIVATE') {
    return new UserError(isPublicRequest
      ? 'That league is private, so ESPN won\'t share it without a login. Private leagues work when you run the app on your own computer (see the README).'
      : 'ESPN refused access to your private league. Check ESPN_S2 and SWID in .env; they stop working if you log out of ESPN.', 403);
  }
  if (err.code === 'NOT_FOUND') return new UserError('ESPN has no league with that ID this season. Check the number after leagueId= in your league\'s URL.', 404);
  return err;
}

// private: { leagueId, teamId, cookies } from .env, or null when hosted.
export async function recommendation(query, privateLeague = null) {
  const season = defaultSeason();
  const leagueId = readId(query.league, 'League ID');
  const teamId = readId(query.team, 'Team');

  let league, source;
  try {
    if (leagueId) {
      if (!teamId) throw new UserError('Choose a team.');
      league = normalize(await fetchRaw({ leagueId, season, cookies: null }), teamId);
      source = 'public';
    } else if (privateLeague?.leagueId && privateLeague?.teamId) {
      league = normalize(await fetchRaw({ leagueId: privateLeague.leagueId, season, cookies: privateLeague.cookies }), privateLeague.teamId);
      source = 'private';
    } else {
      league = mockLeague();
      source = 'sample';
    }
  } catch (err) {
    throw explain(err, !!leagueId);
  }

  if (!league.teams.some(t => t.id === league.myTeamId)) throw new UserError('That team isn\'t in this league.');
  const result = analyze(league);
  const { reasons, source: reasonSource } = await writeReasons(result.recommendations, result.week);
  const slim = p => p && { id: p.id, name: p.name, pos: p.pos, proTeam: p.proTeam, byeWeek: p.byeWeek, pctOwned: p.pctOwned, pctChange: p.pctChange };
  return {
    ...result,
    source,
    reasonSource,
    recommendations: result.recommendations.map((r, i) => ({
      add: slim(r.add), drop: slim(r.drop),
      gain: +r.gain.toFixed(1), gainNow: +r.gainNow.toFixed(1), gainNext: +r.gainNext.toFixed(1),
      coversBye: r.coversBye, advice: r.advice, reason: reasons[i],
    })),
  };
}

export async function teamList(query) {
  const leagueId = readId(query.league, 'League ID');
  if (!leagueId) throw new UserError('Enter a league ID.');
  try {
    return { teams: await fetchTeams({ leagueId, season: defaultSeason(), cookies: null }) };
  } catch (err) {
    throw explain(err, true);
  }
}
