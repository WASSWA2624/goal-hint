import { jobTestRegistry } from './job-fixtures.mjs';

// Trusted synthetic binding, never the production default or a public endpoint.
export function createWorkerBinding() {
  process.on('message', (message) => { if (message === 'stop') { process.emit('SIGTERM'); process.disconnect?.(); } });
  return { pollMs: 50, authorizeWorker: (policy) => policy.mode === 'test' && policy.scope === 'disabled',
    registry: jobTestRegistry(async () => { process.send?.({ kind: 'handled' }); return { status: 'succeeded' }; }, { type: 'test.command' }) };
}
