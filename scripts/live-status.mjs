// Readiness check for the live runner. Reads only the provider /status endpoint,
// which does not consume daily quota, and never opens the database.
import { getRuntimePolicy, parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createAccountStatusReader } from '../src/server/live/live-account.ts';
import { loadOwnerApprovals, ownerEvidenceVerifier } from '../src/server/live/live-approvals.ts';
import { liveWorkload } from '../src/server/live/live-plan.ts';
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
      datePollMinutes: workload.cadence.dateMs / 60_000 } }, null, 2));
  if (gaps.length > 0) process.exitCode = 1;
} catch (error) {
  // Field names, owner-decision gaps and account outcomes only; credentials and provider bodies stay private.
  console.error(JSON.stringify({ ready: false, gaps, account: error instanceof Error ? error.message.split('\n')[0] : 'unavailable' }, null, 2));
  process.exitCode = 1;
}
