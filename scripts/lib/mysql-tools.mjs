import 'server-only';

import { spawn } from 'node:child_process';

export function privateToolEnvironment() {
  if (process.env.NODE_DEBUG?.trim() || process.env.NODE_DEBUG_NATIVE?.trim()) throw new Error('Disable private process diagnostics.');
  return Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA'].filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]));
}
export function mysqlChild(binary, args) {
  const child = spawn(binary, args, { windowsHide: true, env: privateToolEnvironment(), stdio: ['pipe','pipe','pipe'] });
  // Never expose stderr, which can contain SQL, paths or supplied values.
  child.stderr.resume();
  const timer = setTimeout(() => child.kill(), 120_000); timer.unref();
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Private MySQL tool failed.')));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('Private MySQL tool failed.')));
  });
  void done.catch(() => {}); void done.finally(() => clearTimeout(timer)).catch(() => {});
  return { child, done };
}
