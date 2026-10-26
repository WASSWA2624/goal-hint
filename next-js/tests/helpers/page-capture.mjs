import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Acceptance projections may only be written beneath an owned temporary app. */
export async function savePageScenarios(t, environmentName, captured) {
  if (!process.env[environmentName]) return;
  const target = path.resolve(process.env[environmentName]), root = await realpath(fileURLToPath(new URL('../../.tmp', import.meta.url)));
  const within = (value) => { const relative = path.relative(root, value); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };
  assert.ok(within(await realpath(path.dirname(target))));
  let previous = {};
  try { assert.ok(within(await realpath(target))); previous = JSON.parse(await readFile(target, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const scenarios = { ...previous, ...captured };
  await writeFile(target, JSON.stringify(scenarios));
  t.diagnostic(`Saved isolated page acceptance projections; ${Object.keys(scenarios).length} scenarios.`);
}
