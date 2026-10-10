// Records every competition with a current season on the verified API-Football plan as
// GOAL_HINT_COMPETITION_IDS in .env.local. One counted provider request; the live runner's
// provider-day reconciliation imports that usage from the account's own counter.
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { assertOperationAllowed, parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { maximumCompetitionScope } from '../src/domain/feed-query.ts';
import { API_FOOTBALL_ORIGIN } from '../src/server/football/api-football-contract.ts';
import { loadOwnerApprovals, ownerEvidenceVerifier } from '../src/server/live/live-approvals.ts';

const MAXIMUM = maximumCompetitionScope;
const leagues = z.object({ errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]), response: z.array(z.object({
  league: z.object({ id: z.number().int().positive(), name: z.string() }).loose(),
  seasons: z.array(z.object({ year: z.number().int(), current: z.boolean(),
    coverage: z.object({ predictions: z.boolean().optional() }).loose().optional() }).loose()),
}).loose()) }).loose();

async function main() {
  const write = process.argv.includes('--write');
  // Discovery runs before competition IDs exist, so it is declared as a bounded one-request trial.
  const policy = parseRuntimePolicy({ ...process.env, GOAL_HINT_OPERATION_SCOPE: 'trial', GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: '1' });
  const verify = ownerEvidenceVerifier(loadOwnerApprovals());
  assertOperationAllowed(policy, 'football', verify);
  const response = await fetch(new URL('/leagues?current=true', API_FOOTBALL_ORIGIN), {
    headers: { 'x-apisports-key': policy.secrets.footballKey?.read() ?? '' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`API-Football returned HTTP ${response.status}.`);
  const body = leagues.safeParse(await response.json());
  if (!body.success) throw new Error('API-Football returned an unexpected leagues response.');
  const errors = body.data.errors;
  if (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0) throw new Error('API-Football rejected the request; check the key and plan.');
  const current = body.data.response.filter((row) => row.seasons.some((season) => season.current));
  const ids = [...new Set(current.map((row) => row.league.id))].sort((a, b) => a - b);
  const withPredictions = current.filter((row) => row.seasons.some((season) => season.current && season.coverage?.predictions === true)).length;
  console.log(`${ids.length} competitions have a current season; ${withPredictions} report provider prediction coverage.`);
  if (ids.length === 0) throw new Error('No current competitions are available on this plan.');
  if (ids.length > MAXIMUM) throw new Error(`The plan exposes ${ids.length} competitions; the application accepts at most ${MAXIMUM}.`);
  if (!write) { console.log('Dry run: pass --write to update GOAL_HINT_COMPETITION_IDS in .env.local.'); return; }
  const source = await readFile('.env.local', 'utf8'), line = `GOAL_HINT_COMPETITION_IDS=${ids.join(',')}`;
  const updated = /^GOAL_HINT_COMPETITION_IDS=.*$/mu.test(source) ? source.replace(/^GOAL_HINT_COMPETITION_IDS=.*$/mu, line)
    : `${source.replace(/\s*$/u, '')}\n${line}\n`;
  await writeFile('.env.local', updated);
  console.log('Updated GOAL_HINT_COMPETITION_IDS in .env.local; restart the web app and live runner.');
}

try { await main(); }
catch (error) {
  // Provider bodies and credentials are never printed.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Competition discovery failed.');
  process.exitCode = 1;
}
