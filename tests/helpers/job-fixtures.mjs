import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createJobRegistry, defineJob } from '../../src/server/jobs/job-registry.ts';

export const jobTestHash = (value) => createHash('sha256').update(value).digest('hex');
export function jobEnvelope(overrides = {}) {
  const now = Date.now();
  return { version: 1, type: 'test.noop', handlerVersion: 1, idempotencyKey: jobTestHash(randomUUID()), payload: { value: 1 },
    refresh: null, notBefore: now - 1000, expiresAt: now + 60_000, priority: 1, maxAttempts: 3,
    timeoutMs: 10_000, leaseMs: 1000, fallbackReserveMs: 2000, backoff: { baseMs: 100, maxMs: 1000 }, ...overrides };
}
export function jobTestRegistry(handle = async () => ({ status: 'succeeded' }), options = {}) {
  return createJobRegistry([defineJob({ type: options.type ?? 'test.noop', handlerVersion: 1,
    payload: z.strictObject({ value: z.number().int().positive() }), handle, ...options })]);
}
export function jobTestEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env }, credentials = new Set(['DATABASE_URL','TEST_DATABASE_URL','MIGRATION_DATABASE_URL','API_FOOTBALL_KEY','AI_API_KEY','RESEARCH_API_KEY']);
  for (const key of Object.keys(env)) if (key.startsWith('GOAL_HINT_') || key.startsWith('NEXT_PUBLIC_') || credentials.has(key)) delete env[key];
  return { ...env, NODE_ENV: 'test', DEBUG: '', GOAL_HINT_OPERATION_SCOPE: 'disabled', GOAL_HINT_DATABASE_ENABLED: 'true',
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: 'direct',
    GOAL_HINT_DATABASE_POOL_LIMIT: '4', GOAL_HINT_DATABASE_TLS_MODE: 'disabled', GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: '1000',
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: '10000' };
}
