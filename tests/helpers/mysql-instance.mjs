import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../../", import.meta.url));
const instancesRoot = path.resolve(workspace, ".tmp");
const serverTimeoutMs = 60000;
const commandOptions = { windowsHide: true, maxBuffer: 1024 * 1024 };

export class MysqlServerUnavailableError extends Error {
  constructor() {
    super("No genuine MySQL server binary was found. Set MYSQL_TEST_SERVER_BINARY to mysqld; MariaDB and installed services are not integration targets.");
    this.name = "MysqlServerUnavailableError";
  }
}

async function run(binary, args, timeout = 15000) {
  return execFileAsync(binary, args, { ...commandOptions, timeout });
}

/** Locate genuine MySQL without using, changing or stopping an installed service. */
export async function discoverMysqlServer() {
  let candidates;
  if (process.env.MYSQL_TEST_SERVER_BINARY) {
    candidates = [path.resolve(process.env.MYSQL_TEST_SERVER_BINARY)];
  } else {
    const mysqlRoot = path.join(process.env.ProgramFiles ?? "C:/Program Files", "MySQL");
    const installed = await readdir(mysqlRoot, { withFileTypes: true }).catch(() => []);
    candidates = installed.filter((entry) => entry.isDirectory() && /^MySQL Server /u.test(entry.name))
      .map((entry) => path.join(mysqlRoot, entry.name, "bin", "mysqld.exe")).sort().reverse();
  }
  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await run(candidate, ["--no-defaults", "--version"]);
      const version = `${stdout}${stderr}`.trim();
      if (/MySQL/u.test(version) && !/MariaDB/iu.test(version)) {
        return { binary: candidate, version };
      }
    } catch {
      // Missing or incompatible binaries cannot authorize an existing target.
    }
  }
  throw new MysqlServerUnavailableError();
}

async function unusedLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function finishWithin(promise, timeout) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Initialize a new owned datadir and bind its child to loopback only. The root
 * account is passwordless solely inside this throwaway, process-owned instance.
 * Call stop() in finally; it never addresses an installed service or target.
 */
export async function startIsolatedMysql() {
  const { binary, version } = await discoverMysqlServer();
  await mkdir(instancesRoot, { recursive: true });
  const root = await realpath(workspace);
  if (path.relative(root, await realpath(instancesRoot)) !== ".tmp") {
    throw new Error("The MySQL integration directory must resolve inside this workspace; no instance was initialized.");
  }
  const directory = await mkdtemp(path.join(instancesRoot, "mysql-instance-"));
  const ownership = randomUUID();
  const marker = path.join(directory, ".goal-hint-test-owner");
  await writeFile(marker, ownership, { flag: "wx" });
  const datadir = path.join(directory, "data");
  const admin = path.join(path.dirname(binary), process.platform === "win32" ? "mysqladmin.exe" : "mysqladmin");
  const client = path.join(path.dirname(binary), process.platform === "win32" ? "mysql.exe" : "mysql");
  const port = await unusedLoopbackPort();
  const connection = ["--no-defaults", "--protocol=TCP", "--host=127.0.0.1", `--port=${port}`, "--user=root"];
  let child;
  let stopped = false;
  let targetVerified = false;
  let startupOutput = "";

  async function removeOwnedDirectory() {
    const actual = await realpath(directory);
    const parent = await realpath(instancesRoot);
    const relative = path.relative(parent, actual);
    if (path.relative(root, parent) !== ".tmp" || !relative.startsWith("mysql-instance-") || relative.includes(path.sep)
      || path.isAbsolute(relative) || (await readFile(marker, "utf8")) !== ownership) {
      throw new Error("The MySQL test datadir failed its ownership check; it was preserved.");
    }
    await rm(actual, { recursive: true, force: false });
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (targetVerified) await run(admin, [...connection, "shutdown"], 10000).catch(() => {});
      else child.kill();
      if (!await finishWithin(exited(child), 10000)) {
        child.kill();
        if (!await finishWithin(exited(child), 10000)) {
          throw new Error("The owned MySQL child did not exit; its datadir was preserved.");
        }
      }
    }
    await removeOwnedDirectory();
  }

  try {
    await run(binary, ["--no-defaults", "--initialize-insecure", `--datadir=${datadir}`], serverTimeoutMs);
    child = spawn(binary, [
      "--no-defaults", `--datadir=${datadir}`, `--port=${port}`, "--bind-address=127.0.0.1",
      "--mysqlx=OFF", `--pid-file=${path.join(directory, "mysqld.pid")}`, "--console",
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const started = Date.now();
    child.stdout.on("data", (chunk) => { startupOutput = `${startupOutput}${chunk}`.slice(-16384); });
    child.stderr.on("data", (chunk) => { startupOutput = `${startupOutput}${chunk}`.slice(-16384); });
    let spawnError;
    child.once("error", (error) => { spawnError = error; });
    for (;;) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`The owned MySQL instance exited during startup. ${spawnError?.message ?? startupOutput}`);
      }
      try {
        await run(admin, [...connection, "--connect-timeout=1", "ping"], 3000);
        break;
      } catch {
        if (Date.now() - started >= serverTimeoutMs) {
          throw new Error(`The owned MySQL instance did not become ready within ${serverTimeoutMs} ms. ${startupOutput}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const { stdout } = await run(client, [...connection, "--batch", "--skip-column-names", "--execute=SELECT @@datadir"]);
    if ((await realpath(stdout.trim())) !== (await realpath(datadir))) {
      throw new Error("The loopback MySQL target did not prove the newly owned datadir; no schema changes were attempted.");
    }
    targetVerified = true;
    await run(client, [...connection, "--execute=CREATE DATABASE goal_hint_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"]);
    return Object.freeze({
      url: `mysql://root@127.0.0.1:${port}/goal_hint_test`, directory, port, version, stop,
    });
  } catch (error) {
    await stop();
    throw error;
  }
}
