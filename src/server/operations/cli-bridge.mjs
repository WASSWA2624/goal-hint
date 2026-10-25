import 'server-only';

// A narrow pipe-only adapter for Python CLIs to reuse the application's policy,
// database, provider and evaluation services. It is never an HTTP endpoint.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertOperationAllowed, getRuntimePolicy, parseRuntimePolicy, RuntimePolicyError } from '../config/runtime-policy.ts';
import { assertSafeDatabaseDiagnostics, migrationConnectionUrl } from '../database/connection.ts';
import { createDatabaseEvidenceVerifier } from '../database/operator-evidence.ts';

async function dispatch(action, payload) {
  switch (action) {
    case 'brand-raster': {
      const require = createRequire(import.meta.url);
      const sharp = require(process.env.BRAND_NODE_MODULES ? path.join(process.env.BRAND_NODE_MODULES, 'sharp') : 'sharp');
      for (const render of payload.renders) {
        let image = sharp(readFileSync(render.source));
        if (render.width !== undefined) image = image.resize(render.width, render.height);
        await image.png().toFile(render.target);
      }
      return null;
    }
    case 'rendering-fixtures': {
      const { cardExamples } = await import('../../../tests/helpers/match-card-fixtures.mjs');
      const { fixture } = await import('../../../tests/helpers/client-state-fixtures.mjs');
      return { cardExamples: cardExamples(), clientFixture: fixture() };
    }
    case 'monitoring-benchmark': {
      const { benchmark } = await import('../../../tests/helpers/rendering/monitoring-benchmark.mjs');
      return benchmark(payload);
    }
    case 'rendering-notices': {
      const { contactNotice } = await import('../../domain/contact-notice.ts');
      const { privacyNotice } = await import('../../domain/privacy-notice.ts');
      const { termsNotice } = await import('../../domain/terms-notice.ts');
      const { getReportingDate, utcInstantFromEpochMilliseconds } = await import('../../domain/calendar.ts');
      const { feedHref, getFeedEntry, informationPages } = await import('../../domain/navigation.ts');
      const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
      return { contactNotice, privacyNotice, termsNotice, todayPath: feedHref(getFeedEntry(today, 'today')), resultsPath: feedHref(getFeedEntry(today, 'results')), informationPages };
    }
    case 'runtime-check': getRuntimePolicy(); return null;
    case 'backup-database-access': {
      const { loadOwnerApprovals, ownerEvidenceVerifier } = await import('../live/live-approvals.ts');
      assertOperationAllowed(getRuntimePolicy(), 'database', ownerEvidenceVerifier(loadOwnerApprovals()));
      return null;
    }
    case 'database-prepare': {
      assertSafeDatabaseDiagnostics();
      const policy = getRuntimePolicy();
      const target = ['deploy', 'status', 'verify'].includes(payload.command);
      if (target && policy.secrets.migrationDatabaseUrl === null) throw new Error('MIGRATION_DATABASE_URL is required; application credentials are never substituted.');
      if (target) assertOperationAllowed(policy, 'database-migration', createDatabaseEvidenceVerifier());
      return { migrationUrl: target ? migrationConnectionUrl(policy) : null };
    }
    case 'database-health': {
      const { getDatabase, disconnectDatabase } = await import('../database/client.ts');
      const { databaseHealth } = await import('../database/health.ts');
      try { return getRuntimePolicy().capabilities.database ? await databaseHealth(getDatabase()) : 'disabled'; }
      finally { await disconnectDatabase(); }
    }
    case 'database-storage': {
      const { z } = await import('zod');
      const { measureDatabaseStorage, databaseStorageReport, storageMeasurementSchema, storageLimitsSchema } = await import('../database/storage.ts');
      const options = z.strictObject({ sampleRows: z.number().int().min(0).max(1000),
        previous: storageMeasurementSchema.nullable(), limits: storageLimitsSchema }).parse(payload);
      const { getDatabase, disconnectDatabase } = await import('../database/client.ts');
      try {
        if (!getRuntimePolicy().capabilities.database) return { status: 'disabled' };
        const measurement = await measureDatabaseStorage(getDatabase(), options.sampleRows);
        return { status: 'measured', ...databaseStorageReport(measurement, options.previous, options.limits) };
      } finally { await disconnectDatabase(); }
    }
    case 'football-trial': {
      const { executeTrialCommand } = await import('../football/provider-trial-command.ts');
      const result = await executeTrialCommand(payload);
      return { reason: result.reason, report: { liveSuitability: result.report.liveSuitability, oddsSuitability: result.report.oddsSuitability }, reportFile: result.reportFile, jsonFile: result.jsonFile };
    }
    case 'evaluation': {
      const { runEvaluationCommand } = await import('../evaluation/evaluation-command.ts');
      const result = await runEvaluationCommand(payload.args);
      return { kind: result.kind, markdownPath: result.markdownPath, reportPath: result.reportPath, promotionReference: result.promotionReference };
    }
    case 'cache-reconcile': {
      const { getDatabase, disconnectDatabase } = await import('../database/client.ts');
      const { createMysqlPublicCacheStore } = await import('../cache/mysql-public-cache.ts');
      try { return await createMysqlPublicCacheStore(getDatabase()).reconcile(payload.limit); }
      finally { await disconnectDatabase(); }
    }
    case 'competition-access': {
      const { loadOwnerApprovals, ownerEvidenceVerifier } = await import('../live/live-approvals.ts');
      const { maximumCompetitionScope } = await import('../../domain/feed-query.ts');
      const { API_FOOTBALL_ORIGIN } = await import('../football/api-football-contract.ts');
      const policy = parseRuntimePolicy({ ...process.env, GOAL_HINT_OPERATION_SCOPE: 'trial', GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: '1' });
      assertOperationAllowed(policy, 'football', ownerEvidenceVerifier(loadOwnerApprovals()));
      return { key: policy.secrets.footballKey?.read() ?? '', maximum: maximumCompetitionScope, origin: API_FOOTBALL_ORIGIN };
    }
    case 'live-status': {
      const { readLiveStatus } = await import('../live/live-status-command.mjs');
      return readLiveStatus();
    }
    case 'backup': {
      const { executeBackupCommand } = await import('../backup/backup-command.mjs');
      const { BackupError } = await import('../backup/backup-contract.mjs');
      if (!path.isAbsolute(payload.binding)) throw new BackupError('binding-required');
      const adapter = await import(pathToFileURL(payload.binding).href);
      if (typeof adapter.createBackupBinding !== 'function') throw new BackupError('binding-required');
      const runtime = getRuntimePolicy(), binding = await adapter.createBackupBinding(runtime), events = [];
      try {
        if (binding.policy?.mode === 'live' && ['snapshot', 'archive'].includes(payload.operation)) assertOperationAllowed(runtime, 'database', binding.verifyDatabaseEvidence);
        await executeBackupCommand([payload.operation], { ...binding, emit: binding.emit ?? ((event) => events.push(event)) });
        return { events };
      } finally { await binding.close?.(); }
    }
    default: throw new Error('Unsupported private service operation.');
  }
}

let action;
try {
  const request = JSON.parse(readFileSync(0, 'utf8'));
  action = request.action;
  const { payload } = request;
  process.stdout.write('\x1e' + JSON.stringify({ ok: true, value: await dispatch(action, payload) }));
} catch (error) {
  const safe = error instanceof RuntimePolicyError || ['BackupError', 'TrialCommandError', 'OwnerApprovalError'].includes(error?.name)
    || error?.message === 'MIGRATION_DATABASE_URL is required; application credentials are never substituted.';
  const fallback = {
    'database-health': 'Database readiness: unavailable. Check private configuration and approved access.',
    'database-storage': 'Database storage measurement unavailable. Check private configuration, MySQL version and approved access.',
    'football-trial': 'Provider trial unavailable; private input and storage diagnostics are withheld.',
    'cache-reconcile': 'Cache maintenance unavailable; check approved database access and the 031 migration. Private diagnostics are withheld.',
    backup: 'Backup operation failed; private diagnostics are withheld.',
  }[action] ?? 'Application service unavailable; private diagnostics are withheld.';
  process.stdout.write('\x1e' + JSON.stringify({ ok: false, error: safe ? error.message : fallback }));
  process.exitCode = 1;
}
