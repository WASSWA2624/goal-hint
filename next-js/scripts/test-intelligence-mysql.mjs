import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverMysqlServer } from '../src/server/backup/isolated-mysql.mjs';

// An absent database dependency must not turn acceptance into a skipped success.
try {
  const { binary, version } = await discoverMysqlServer();
  process.stdout.write(`Disposable shadow acceptance: ${version}\n`);
  const child = spawn(process.execPath, ['--conditions=react-server', '--test', '--test-concurrency=1',
    'tests/intelligence-shadow.integration.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, MYSQL_TEST_SERVER_BINARY: binary }, windowsHide: true, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1));
  });
} catch {
  process.stderr.write('Genuine MySQL is required. Set MYSQL_TEST_SERVER_BINARY to a portable mysqld; no application database or installed service is used.\n');
  process.exitCode = 1;
}
