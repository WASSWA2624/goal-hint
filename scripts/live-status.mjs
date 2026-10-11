// Readiness check for the live runner. Reads only the provider /status endpoint,
// which does not consume daily quota, and never opens the database.
import { getRuntimePolicy, parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createAccountStatusReader } from '../src/server/live/live-account.ts';
import { loadOwnerApprovals, ownerEvidenceVerifier } from '../src/server/live/live-approvals.ts';
import { liveWorkload, teamCodeImportsEnabled } from '../src/server/live/live-plan.ts';
import { TEAM_CODES_MAX_REQUESTS, TEAM_CODES_SEASONS_PER_SLOT, TEAM_CODES_SLOT_MS } from '../src/server/teams/team-code-jobs.ts';
import { liveReadiness } from '../src/server/live/live-runtime.ts';

const gaps = [];
let policy, verify;
try { policy = getRuntimePolicy(); verify = liveReadiness(policy); }
catch (error) {
  gaps.push(...(error instanceof Error ? error.message.split('\n').slice(1).map((line) => line.replace(/^- /u, '')) : []));
  if (!process.env.GOAL_HINT_COMPETITION_IDS) gaps.push('Run: npm run live:competitions -- --write');
}
try {
  // Without a complete live configuration, the free account check runs under a bounded trial declaration.
  policy ??= parseRuntimePolicy({ ...process.env, GOAL_HINT_OPERATION_SCOPE: 'trial', GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: '1' });
  verify ??= ownerEvidenceVerifier(loadOwnerApprovals());
  const status = await createAccountStatusReader({ policy, verifyEvidence: verify })();
  const workload = liveWorkload(status.dailyLimit, status.secondLimit, status.plan, status.minuteLimit);
  console.log(JSON.stringify({ ready: gaps.length === 0, gaps,
    plan: status.plan, active: status.active, expiresAt: status.expiresAt === null ? null : new Date(status.expiresAt).toISOString(),
    dailyLimit: status.dailyLimit, usedToday: status.usedToday, minuteLimit: status.minuteLimit,
    competitions: policy.choices.competitionIds?.length ?? 0,
    workload: { importDays: workload.importDays, refreshCapacityPerDay: workload.refreshCapacity, workers: workload.workers,
      livePollSeconds: workload.cadence.liveMs === null ? null : workload.cadence.liveMs / 1000,
      datePollMinutes: workload.cadence.dateMs / 60_000,
      // Odds (052) run only when enabled, eligible on this plan and given a documented bookmaker.
      odds: { enabled: policy.choices.odds.enabled, eligible: workload.odds.eligible, bookmakerConfigured: policy.choices.odds.bookmakerId !== null,
        imports: policy.choices.odds.enabled && workload.odds.eligible && policy.choices.odds.bookmakerId !== null,
        // Without recorded display rights (OP-36), imported odds stay private.
        displayRightsRecorded: policy.choices.odds.rightsRef !== null && verify(policy.choices.odds.rightsRef, 'football-odds-rights'),
        // Odds spend at most the spare per provider day and never the reserve.
        floorPerDay: workload.odds.floor, sparePerDay: workload.odds.spare, reservePerDay: workload.odds.reserve, sweepHours: workload.odds.sweepMs / 3_600_000,
        dates: workload.odds.dates, maxPagesPerDate: workload.odds.maxPages },
      // Team codes share the odds spare and eligibility: on by default, never on Free or slow plans.
      teamCodes: { enabled: policy.choices.teamCodes.enabled, eligible: workload.odds.eligible, imports: teamCodeImportsEnabled(policy, workload),
        sweepHours: TEAM_CODES_SLOT_MS / 3_600_000, leaguesPerSweep: TEAM_CODES_SEASONS_PER_SLOT, maxRequestsPerSweep: TEAM_CODES_MAX_REQUESTS } } }, null, 2));
  if (gaps.length > 0) process.exitCode = 1;
} catch (error) {
  // Field names, owner-decision gaps and account outcomes only; credentials and provider bodies stay private.
  console.error(JSON.stringify({ ready: false, gaps, account: error instanceof Error ? error.message.split('\n')[0] : 'unavailable' }, null, 2));
  process.exitCode = 1;
}
