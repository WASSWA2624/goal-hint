import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

// Integration tests also execute Node workers and inline modules. Route Python
// CLI paths to Python while retaining the existing Node paths unchanged.
export function execFile(executable, args, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const script = executable === process.execPath ? args.findIndex((value) => value.endsWith('.py')) : -1;
  if (script >= 0) {
    const environment = { ...process.env, ...options?.env, NODE_BINARY: process.execPath };
    return nodeExecFile(environment.PYTHON ?? 'python', args.slice(script), { ...options, env: environment }, callback);
  }
  return nodeExecFile(executable, args, options, callback);
}

// Match child_process.execFile's structured promisified return contract.
execFile[promisify.custom] = (...args) => new Promise((resolve, reject) => {
  execFile(...args, (error, stdout, stderr) => {
    if (error) {
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    }
    else resolve({ stdout, stderr });
  });
});
