// Local server. `npm start` uses your .env league (private leagues work here);
// `npm run mock` ignores .env and shows the sample league.
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { recommendation, teamList } from './lib/api.js';
import { fetchRaw } from './lib/espn.js';

const MOCK = process.argv.includes('--mock');
const dir = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const privateLeague = MOCK ? null : {
  leagueId: env.LEAGUE_ID,
  teamId: env.TEAM_ID,
  cookies: env.ESPN_S2 && env.SWID ? { espnS2: env.ESPN_S2, swid: env.SWID } : null,
};

const app = express();
app.use(express.static(path.join(dir, 'public')));

const send = fn => async (req, res) => {
  try { res.json(await fn(req.query)); }
  catch (err) {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong reading ESPN. Check the terminal for details.' });
  }
};

app.get('/api/recommend', send(q => recommendation(q, privateLeague)));
app.get('/api/teams', send(teamList));

// Debug view of ESPN's raw responses for your .env league. Local only; never deployed.
app.get('/api/raw', send(() => fetchRaw({ leagueId: env.LEAGUE_ID, season: Number(env.SEASON) || new Date().getFullYear(), cookies: privateLeague?.cookies })));

const port = Number(env.PORT || 3000);
app.listen(port, () => console.log(`Waiver Wire Assistant on http://localhost:${port}${MOCK ? ' (sample league)' : ''}`));
