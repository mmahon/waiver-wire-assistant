// Netlify Function for the hosted site. It never reads ESPN cookies or a private
// league from the environment: visitors see the sample league unless they enter
// a public ESPN league themselves.
import { recommendation, teamList } from '../../lib/api.js';

export default async (req) => {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  try {
    const body = url.pathname.endsWith('/teams') ? await teamList(query) : await recommendation(query, null);
    return Response.json(body, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (!err.status) console.error(err);
    return Response.json(
      { error: err.status ? err.message : 'Something went wrong reading ESPN. Try again in a minute.' },
      { status: err.status || 500 },
    );
  }
};

export const config = { path: ['/api/recommend', '/api/teams'] };
