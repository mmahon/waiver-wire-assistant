# Waiver Wire Assistant

**Live demo:** [Waiver Wire Assistant](https://mattco-waiver-assist.netlify.app/) 
**Case study:** [Product brief](https://docs.google.com/document/d/1tdaiGJsU9hPwl69Xbx0en2N4Why2evHFQLNC6uBXqjs/edit)

A side project built for my own ESPN league. Each week it recommends the waiver moves worth making for *your* roster, looks ahead to next week's byes, and says whether a player is worth spending your waiver position on. I wrote the spec, built it with AI coding tools, tested it on my own team, and wrote up what I learned and what I'd build next. The case study covers the product decisions; this README covers how it works and how to run it.

The live demo opens on a sample league with made-up players. You can also try any public ESPN league.

---

## How it works

- **Two-week view.** Scores each lineup slot against the league's median starter, this week at full weight and next week at half weight, so upcoming byes count.
- **Real roster math.** Tests every add/drop pair against your best possible lineup, so bench coverage and byes are handled automatically. Moves build on each other, so you won't see two kickers for one bye.
- **Claim or wait.** In a rolling waiver order, a claim sends you to the back. The tool claims only when a contested player is worth your current spot, and otherwise says to wait and add him as a free agent after waivers clear.
- **Rules decide, AI explains.** The recommendations come from visible rules. Claude (optional) only rewrites the one-sentence reason, using the same facts.

## Run it

Requires Node 20.6 or newer.

```bash
npm install
npm run mock      # sample league with made-up players, no ESPN needed
```

Open http://localhost:3000.

## Connect your ESPN league

1. Copy `.env.example` to `.env`.
2. Set `LEAGUE_ID` (the `leagueId=` number in your league's URL), `TEAM_ID` (the `teamId=` number on your team page) and `SEASON`.
3. For a private league, add `ESPN_S2` and `SWID`. Log in to ESPN in Chrome, open dev tools (right-click, Inspect), go to **Application → Cookies → espn.com**, and copy both values.
4. Run `npm start`.

**Keep `ESPN_S2` and `SWID` private.** They work like your ESPN login. They stay in `.env` (already ignored by Git) and are only ever sent from the server to ESPN, never to the browser.

## First run: check the data

ESPN's API is unofficial and undocumented, so the field names in `lib/espn.js` come from community projects. On your first real run, check:

- **Correct week and team.** The header shows the right week and your team name.
- **Waiver position.** Your spot matches ESPN. If it's missing, look for the team's waiver field in `/api/raw`.
- **Projections.** Starters show sensible points. If everything is zero, projections may use different stat codes; look at a player's `stats` array in `/api/raw`.
- **Byes.** Byes appear on the right players.

`http://localhost:3000/api/raw` shows ESPN's raw responses. It's for local debugging only; don't deploy that route.

## Which league you see

| Where | What loads by default | Other options |
|---|---|---|
| Hosted site (Netlify) | Sample league, for every visitor | Any **public** ESPN league, via "Try your own league" |
| `npm run mock` | Sample league | Public leagues |
| `npm start` | Your `.env` league (private works) | Public leagues |

The hosted site never reads ESPN cookies, so sharing the link never shows your league. Whatever a visitor enters stays in their own browser.

## Deploy to Netlify

1. Push the project to GitHub. Check that `.env` is **not** among the committed files (`.gitignore` already excludes it).
2. In Netlify, choose **Add new site → Import an existing project** and pick the repo. The settings come from `netlify.toml`, so there's nothing to fill in.
3. Don't add `ESPN_S2`, `SWID`, `LEAGUE_ID` or `TEAM_ID` to Netlify; the hosted version ignores them anyway.
4. Optional: add `ANTHROPIC_API_KEY` under **Site configuration → Environment variables** if you want Claude-written reasons on the live site. Every page load then makes a paid API call, so leave it unset if you'd rather keep the free templates.

The `/api/raw` debug page exists only in the local server and is never deployed.

## Tuning

The knobs are in `CONFIG` at the top of `lib/engine.js`:

- **`nextWeekWeight`:** how much next week counts.
- **`claimThreshold`:** how big a gain must be to spend a claim, for each part of the waiver order.
- **`contestedChange` / `contestedOwned`:** what counts as a player other managers want.
- **`protectOwnedPct`:** players rostered in at least this % of leagues are never suggested as drops.

## Tests

```bash
npm test
```

## Files

- `lib/api.js`: decides which league to load; shared by the local server and Netlify
- `netlify/functions/api.mjs`: the hosted version's API
- `lib/engine.js`: lineups, slot gaps, add/drop search, claim-or-wait (no network calls)
- `lib/espn.js`: ESPN requests and normalization
- `lib/reasons.js`: one-sentence reasons (templates, optional Claude)
- `fixtures/mock.js`: the sample league
- `public/index.html`: the page
