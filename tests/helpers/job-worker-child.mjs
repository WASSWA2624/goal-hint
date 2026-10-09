import { parseRuntimePolicy } from '../../src/server/config/runtime-policy.ts';
import { createDatabase } from '../../src/server/database/client.ts';
import { createMysqlJobQueue } from '../../src/server/jobs/job-mysql-store.ts';
import { createJobWorker } from '../../src/server/jobs/job-worker.ts';
import { jobTestHash, jobTestRegistry } from './job-fixtures.mjs';

const database = createDatabase(parseRuntimePolicy(process.env)), queue = createMysqlJobQueue(database);
const mode = process.argv[2], type = process.argv[3];
const controller = new AbortController();
process.on('message', (message) => { if (message === 'stop') controller.abort(); });
const registry = jobTestRegistry(async (_payload, context) => {
  await database.transaction(async (transaction) => {
    await queue.assertOwned(transaction, context.lease);
    await transaction.$executeRaw`INSERT IGNORE INTO JobTestEffect (jobId, value) VALUES (${context.lease.jobId}, 1)`;
  });
  if (mode === 'die') {
    process.send?.({ kind: 'effect', jobId: context.lease.jobId });
    await new Promise(() => {});
  }
  return { status: 'succeeded' };
}, { type });
const worker = createJobWorker({ queue, registry, ownerId: jobTestHash(`child:${process.pid}`), pollMs: 50,
  onEvent(event) { if (event.kind === 'succeeded') process.send?.({ kind: 'succeeded', jobId: event.jobId }); } });
process.send?.({ kind: 'ready' });
try { await worker.run(controller.signal); }
finally { await database.disconnect(); process.disconnect?.(); }
