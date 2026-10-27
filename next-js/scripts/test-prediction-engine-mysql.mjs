import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverMysqlServer } from "../src/server/backup/isolated-mysql.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "tests/prediction-refresh.integration.mjs",
  "tests/recommendation-refresh.integration.mjs",
  "tests/revision-publication.integration.mjs",
  "tests/odds.integration.mjs",
  "tests/prediction-history.integration.mjs",
  "tests/prediction-quotes.integration.mjs",
];

// This acceptance command requires MySQL: an unavailable dependency must not turn
// all ten cases into a successful run consisting only of skips.
try {
  const { binary, version } = await discoverMysqlServer();
  process.stdout.write(`Disposable prediction-engine acceptance: ${version}\n`);
  const child = spawn(process.execPath, ["--conditions=react-server", "--test", "--test-concurrency=1", ...files], {
    cwd: root, env: { ...process.env, MYSQL_TEST_SERVER_BINARY: binary }, windowsHide: true, stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch {
  process.stderr.write("Genuine MySQL is required. Set MYSQL_TEST_SERVER_BINARY to the portable mysqld binary; no installed service or application database is used.\n");
  process.exitCode = 1;
}
