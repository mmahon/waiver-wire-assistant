import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendation, teamList } from '../lib/api.js';

test('no league given and nothing configured: sample league', async () => {
  const r = await recommendation({}, null);
  assert.equal(r.source, 'sample');
  assert.ok(r.recommendations.length > 0);
});

test('hosted mode never falls back to a private league', async () => {
  const r = await recommendation({}, null);
  assert.equal(r.source, 'sample');
});

test('rejects non-numeric IDs', async () => {
  await assert.rejects(recommendation({ league: 'abc', team: '1' }), /number/);
  await assert.rejects(recommendation({ league: '123' }), /Choose a team/);
});

test('private league entered on the hosted site gets a clear message, and no cookies are sent', async () => {
  const realFetch = globalThis.fetch;
  let sentCookie = false;
  globalThis.fetch = async (url, opts) => { if (opts?.headers?.cookie) sentCookie = true; return new Response('{}', { status: 401 }); };
  try {
    await assert.rejects(teamList({ league: '123456' }), err => err.status === 403 && /private/.test(err.message));
    await assert.rejects(recommendation({ league: '123456', team: '1' }, { leagueId: '9', teamId: '1', cookies: { espnS2: 'x', swid: 'y' } }), /private/);
    assert.equal(sentCookie, false);
  } finally { globalThis.fetch = realFetch; }
});
