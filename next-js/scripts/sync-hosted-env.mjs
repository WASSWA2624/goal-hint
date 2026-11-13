import { spawnSync } from "node:child_process";
import { closeSync, constants, fchownSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const address = "209.74.80.202";
const node = "/opt/node-v24.18.1-linux-x64/bin/node";
const targets = {
  staging: { account: "ghstage", database: "ghstage_localcopy", file: ".env.test", host: "test.goalhint.com" },
  production: { account: "ghprod", database: "ghprod_prod", file: ".env.production", host: "goalhint.com" },
};
const sandboxWebhook = "https://test.goalhint.com/api/payments/flutterwave/webhook";
const webKeys = new Set([
  "YOOLA_SMS_API_KEY", "YOOLA_SMS_SENDER",
  "GOAL_HINT_ADMIN_PHONES", "GOAL_HINT_ADMIN_PASSWORD",
  "GOAL_HINT_ANALYTICS_ENABLED", "GOAL_HINT_ANALYTICS_SECRET", "GOAL_HINT_ANALYTICS_RETENTION_DAYS",
  "GOAL_HINT_ANALYTICS_GEO_SOURCE",
]);
const sandboxKeys = new Set([
  "GOAL_HINT_FLUTTERWAVE_SECRET_KEY", "GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET", "GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL",
]);
const keyName = /^[A-Z][A-Z0-9_]*$/u;
const maxBytes = 256 * 1024;
const wait = new Int32Array(new SharedArrayBuffer(4));

class SyncError extends Error {}

function ensure(condition, message) {
  if (!condition) throw new SyncError(message);
}

function envText(bytes) {
  ensure(bytes.length <= maxBytes, "An environment file exceeds the supported size.");
  const text = bytes.toString("utf8");
  ensure(Buffer.from(text).equals(bytes) && !text.includes("\0"), "An environment file must contain valid UTF-8 dotenv text.");
  return text;
}

// Offsets retain unknown settings, comments, whitespace and newline style when
// replacing an assignment. Node's parser remains the authority on its value.
function assignments(text) {
  const records = new Map();
  for (let start = 0; start < text.length;) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end);
    const match = /^[\uFEFF \t]*(?:export[ \t]+)?([^#=\s]+)[ \t]*=[ \t]*/u.exec(line);
    if (match) {
      const valueStart = start + match[0].length;
      const quote = text[valueStart];
      if (quote === '"' || quote === "'" || quote === "`") {
        const quoteEnd = text.indexOf(quote, valueStart + 1);
        if (quoteEnd >= end) {
          const lineEnd = text.indexOf("\n", quoteEnd + 1);
          end = lineEnd === -1 ? text.length : lineEnd;
        }
      }
      const entries = records.get(match[1]) ?? [];
      entries.push({ start, end: Math.min(end + 1, text.length) });
      records.set(match[1], entries);
    }
    start = end + 1;
  }
  return records;
}

function requireUnique(records, key) {
  const entries = records.get(key) ?? [];
  ensure(entries.length <= 1, `${key} appears more than once in an environment file.`);
  return entries[0];
}

function validateSelection(target, key, action) {
  ensure(keyName.test(key), "Select environment keys by their exact uppercase names.");
  ensure(webKeys.has(key) || target === "staging" && sandboxKeys.has(key), `${key} cannot be changed by this command for ${target}.`);
  ensure(action !== "clear" || key !== "GOAL_HINT_ANALYTICS_SECRET", `${key} cannot be cleared by this command.`);
}

function validateValue(key, value) {
  const token = /^\S+$/u;
  const rules = {
    YOOLA_SMS_API_KEY: token.test(value),
    YOOLA_SMS_SENDER: /^[a-z\d]+$/iu.test(value),
    GOAL_HINT_ADMIN_PASSWORD: value.length >= 8 && value.length <= 128,
    GOAL_HINT_ANALYTICS_SECRET: value.length >= 32 && token.test(value),
    GOAL_HINT_ANALYTICS_ENABLED: /^(?:true|false)$/u.test(value),
    GOAL_HINT_ANALYTICS_RETENTION_DAYS: /^[1-9]\d*$/u.test(value) && Number(value) <= 1095,
    GOAL_HINT_ANALYTICS_GEO_SOURCE: /^(?:timezone|cloudflare|vercel)$/u.test(value),
    GOAL_HINT_FLUTTERWAVE_SECRET_KEY: /^FLWSECK_TEST-\S+$/u.test(value),
    GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET: token.test(value),
    GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL: value === sandboxWebhook,
  };
  ensure(!/[\x00-\x1f\x7f]/u.test(value) && value.length <= 4096 && rules[key] !== false, `${key} has an invalid value.`);
  if (key === "GOAL_HINT_ADMIN_PHONES") {
    let phones;
    try { phones = JSON.parse(value); } catch { /* Report only the key. */ }
    ensure(Array.isArray(phones) && phones.length <= 100 && phones.every((phone) =>
      typeof phone === "string" && /^[1-9]\d{9,14}$/u.test(phone) &&
      (!phone.startsWith("256") || /^2567\d{8}$/u.test(phone))), `${key} must be a JSON array of canonical phone strings.`);
  }
}

export function localChanges(text, target, setKeys, clearKeys) {
  ensure(Object.hasOwn(targets, target), "Select staging or production explicitly.");
  ensure(setKeys.length + clearKeys.length > 0, "Select at least one --key or --clear.");
  const records = assignments(text);
  const settings = parseEnv(text);
  requireUnique(records, "GOAL_HINT_DEPLOYMENT_ENVIRONMENT");
  ensure(settings.GOAL_HINT_DEPLOYMENT_ENVIRONMENT === target, `The local environment file does not identify ${target}.`);
  const names = new Set();
  return [...setKeys.map((key) => ({ key, action: "set" })), ...clearKeys.map((key) => ({ key, action: "clear" }))]
    .map(({ key, action }) => {
      validateSelection(target, key, action);
      ensure(!names.has(key), `Select ${key} only once.`);
      names.add(key);
      if (action === "clear") return { key, action };
      requireUnique(records, key);
      const value = settings[key];
      if (!value?.trim()) return { key, action: "skip" };
      validateValue(key, value);
      return { key, action, value };
    });
}

function assignment(key, value) {
  for (const quote of ["'", '"', "`", ""]) {
    const line = `${key}=${quote}${value}${quote}`;
    if (parseEnv(line)[key] === value) return line;
  }
  throw new SyncError(`${key} cannot be represented safely in a single dotenv assignment.`);
}

export function patchSettings(text, changes) {
  const settings = parseEnv(text);
  const expected = { ...settings };
  const records = assignments(text);
  const patches = [];
  const appended = [];
  const summary = [];
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  for (const { key, action, value } of changes) {
    if (action === "skip") {
      summary.push(`${key}: skipped (blank or absent locally)`);
      continue;
    }
    const entry = requireUnique(records, key);
    const current = settings[key];
    ensure(Boolean(entry) === (current !== undefined), `${key} has an unsupported assignment layout in the hosted file.`);
    if (action === "set" ? current === value : current === undefined) {
      summary.push(`${key}: unchanged`);
      continue;
    }
    if (action === "clear") {
      delete expected[key];
      patches.push({ ...entry, replacement: "" });
      summary.push(`${key}: clear`);
    } else {
      expected[key] = value;
      const line = assignment(key, value);
      if (entry) {
        const ending = /\r?\n$/u.exec(text.slice(entry.start, entry.end))?.[0] ?? "";
        patches.push({ ...entry, replacement: line + ending });
      } else appended.push(line);
      summary.push(`${key}: ${entry ? "update" : "add"}`);
    }
  }
  let updated = text;
  for (const { start, end, replacement } of patches.sort((a, b) => b.start - a.start)) {
    updated = updated.slice(0, start) + replacement + updated.slice(end);
  }
  if (appended.length) {
    const separator = updated && !updated.endsWith("\n") ? newline : "";
    updated += separator + appended.join(newline) + newline;
  }
  const result = parseEnv(updated);
  ensure(Object.keys(result).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => result[key] === value),
    "The change would alter another dotenv setting. Correct the hosted file layout before retrying.");
  return { updated, summary };
}

function readFile(path, { uid, gid, mode, privateFile = false } = {}) {
  const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(file);
    ensure(info.isFile() && info.size <= maxBytes && (uid === undefined || info.uid === uid) &&
      (gid === undefined || info.gid === gid) && (mode === undefined || (info.mode & 0o777) === mode) &&
      (!privateFile || info.nlink === 1), `Unexpected hosted file permissions or type for ${basename(path)}.`);
    return readFileSync(file);
  } finally { closeSync(file); }
}

function run(executable, args, options = {}) {
  return spawnSync(executable, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "pipe"], ...options });
}

function identity(settings, environment, database) {
  let url, databaseName;
  try {
    url = new URL(settings.DATABASE_URL);
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch { /* Report only the target identity check. */ }
  ensure(settings.GOAL_HINT_DEPLOYMENT_ENVIRONMENT === environment && settings.GOAL_HINT_DATABASE_ENABLED === "true" &&
    settings.GOAL_HINT_DATABASE_CONNECTION_MODE === "direct" && settings.GOAL_HINT_DATABASE_TLS_MODE === "required" &&
    url?.protocol === "mysql:" && url.hostname === "127.0.0.1" && (!url.port || url.port === "3306") && url.username &&
    url.password && !url.search && !url.hash && databaseName === database, "The hosted settings do not match the pinned environment and database.");
}

function hostedFiles(environment, target) {
  const { account, database, file } = target;
  const home = `/home/${account}`;
  const privateDir = join(home, "goal-hint-private");
  const active = join(home, "goal-hint");
  const release = realpathSync(active);
  const expectedRoot = join(home, "goal-hint-releases");
  ensure(lstatSync(active).isSymbolicLink() && dirname(release) === expectedRoot && realpathSync(expectedRoot) === expectedRoot &&
    lstatSync(join(release, "app.js")).isFile(), "The active release is outside the pinned account's release directory.");
  const accountInfo = run("/usr/bin/getent", ["passwd", account]);
  const fields = accountInfo.stdout?.trim().split(":");
  ensure(accountInfo.status === 0 && fields?.[0] === account && fields[5] === home &&
    /^\d+$/u.test(fields[2]) && /^\d+$/u.test(fields[3]), "The hosted account does not match the pinned target.");
  const owner = { uid: Number(fields[2]), gid: Number(fields[3]), mode: 0o600, privateFile: true };
  const standalone = join(release, "standalone");
  const privateInfo = lstatSync(privateDir);
  ensure(privateInfo.isDirectory() && privateInfo.uid === owner.uid && (privateInfo.mode & 0o777) === 0o700 &&
    lstatSync(standalone).isDirectory() && lstatSync(join(release, "tmp")).isDirectory() &&
    lstatSync(join(standalone, "server.js")).isFile(), "The hosted private or active runtime directory is invalid.");
  const alternate = join(standalone, environment === "staging" ? ".env.production" : ".env.test");
  ensure(!lstatSync(alternate, { throwIfNoEntry: false }), "The active runtime has more than one hosted environment file.");
  const build = JSON.parse(readFile(join(release, "BUILD_INFO.json")));
  const marker = JSON.parse(readFile(join(release, ".goal-hint-migrations.json")));
  ensure(build.uncommittedChanges === false && /^[0-9a-f]{40}$/u.test(build.commit) && /^[0-9a-f]{64}$/u.test(build.migrations) &&
    marker.environment === environment && marker.database === database && marker.migrations === build.migrations,
    "The active release build and migration marker do not match the pinned target.");
  const canonical = join(privateDir, file);
  const effective = join(standalone, file);
  const restart = join(release, "tmp", "restart.txt");
  const restartInfo = lstatSync(restart);
  ensure(restartInfo.isFile() && restartInfo.uid === owner.uid && restartInfo.nlink === 1, "The active Passenger restart marker is invalid.");
  const originals = [canonical, effective].map((path) => readFile(path, owner));
  ensure(originals[0].equals(originals[1]), "The canonical and effective hosted settings differ. Reconcile them before syncing.");
  const settings = envText(originals[0]);
  identity(parseEnv(settings), environment, database);
  const databaseResult = run("/usr/bin/mariadb", ["--defaults-file=/root/.my.cnf", "--protocol=socket", "--batch", "--skip-column-names",
    `--database=${database}`, "--execute=SELECT DATABASE()"]);
  ensure(databaseResult.status === 0 && databaseResult.stdout?.trim() === database, "The pinned hosted database could not be verified.");
  return { active, release, canonical, effective, restart, originals, owner, settings, commit: build.commit };
}

function writePrivate(file, bytes, owner) {
  const fd = openSync(file, "wx", 0o600);
  try {
    if (owner) fchownSync(fd, owner.uid, owner.gid);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function atomicWrite(path, bytes, owner) {
  const temporary = mkdtempSync(join(dirname(path), ".env-sync-"));
  const staged = join(temporary, "settings");
  try {
    writePrivate(staged, bytes, owner);
    renameSync(staged, path);
  } finally {
    if (lstatSync(staged, { throwIfNoEntry: false })) unlinkSync(staged);
    rmdirSync(temporary);
  }
}

function backupFiles(environment, originals) {
  const base = "/root/goalhint-setup/config-backups";
  const parent = join(base, environment);
  for (const directory of [base, parent]) {
    if (!lstatSync(directory, { throwIfNoEntry: false })) mkdirSync(directory, { mode: 0o700 });
    const info = lstatSync(directory);
    ensure(info.isDirectory() && info.uid === 0 && (info.mode & 0o777) === 0o700, "The private config backup directory is invalid.");
  }
  const stamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const backup = mkdtempSync(join(parent, `${stamp}-`));
  writePrivate(join(backup, "canonical.env"), originals[0]);
  writePrivate(join(backup, "effective.env"), originals[1]);
  return backup;
}

function smoke(target, environment) {
  for (const path of ["/en/matches", "/api/matches", "/api/account/session"]) {
    const result = run("/usr/bin/curl", ["--silent", "--fail", "--noproxy", "*", "--max-time", "8",
      "--resolve", `${target.host}:443:${address}`, "--header", "Cache-Control: no-cache",
      "--dump-header", "-", "--output", "/dev/null", "--write-out", "%{http_code}",
      `https://${target.host}${path}`]);
    if (result.status !== 0 || !result.stdout.endsWith("200")) return false;
    if (path === "/en/matches" && environment === "staging" && !/^x-robots-tag:[^\r\n]*\bnoindex\b/imu.test(result.stdout)) return false;
    if (path.startsWith("/api/") && !/^content-type:[ \t]*application\/json\b/imu.test(result.stdout)) return false;
  }
  return true;
}

export function passengerProcesses(appRoot) {
  const status = run("/usr/sbin/passenger-status", ["--show=xml"], {
    env: { ...process.env, PASSENGER_INSTANCE_REGISTRY_DIR: "/opt/cpanel/ea-passenger/run/passenger-instreg" },
  });
  if (status.status !== 0) return null;
  const query = `import json, sys, xml.etree.ElementTree as E
root = E.parse(sys.stdin).getroot()
groups = [g for g in root.findall(".//supergroup/group") if g.findtext("app_root") == sys.argv[1]]
if len(groups) != 1:
    raise SystemExit(1)
print(json.dumps([int(p.findtext("spawn_end_time")) for p in groups[0].findall("./processes/process")
    if p.findtext("life_status") == "ALIVE" and p.findtext("enabled") == "ENABLED"]))`;
  const result = run("/usr/bin/python3", ["-c", query, appRoot], { input: status.stdout, stdio: ["pipe", "pipe", "pipe"] });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function smokeAfterRestart(target, environment, active, restartTime) {
  for (let attempt = 0; attempt < 4; attempt++) {
    Atomics.wait(wait, 0, 0, attempt === 0 ? 1_000 : 2_000);
    if (!smoke(target, environment)) continue;
    const processes = passengerProcesses(active);
    if (processes?.length && processes.every((spawnTime) => spawnTime >= restartTime)) return true;
  }
  return false;
}

export function applyConfig({ paths, originals, updated, verify, backup, write, restart, smoke }) {
  verify();
  ensure(smoke(false), "Hosted HTTPS smoke failed before changes. No config was written.");
  verify();
  const backupPath = backup();
  try {
    for (const path of paths) write(path, updated);
    restart();
    ensure(smoke(true), "Hosted HTTPS smoke failed after restart.");
    return backupPath;
  } catch {
    let recovered = true;
    for (const [index, path] of paths.entries()) {
      try { write(path, originals[index]); } catch { recovered = false; }
    }
    if (recovered) {
      try { restart(); recovered = smoke(true); } catch { recovered = false; }
    }
    ensure(recovered, `Config sync failed and recovery needs attention. Private backup: ${backupPath}`);
    throw new SyncError(`Config sync failed. Both settings files were restored and HTTPS recovered. Private backup: ${backupPath}`);
  }
}

export function remoteMain(request) {
  process.umask(0o077);
  try {
    const { environment, changes, apply } = request;
    ensure(Object.hasOwn(targets, environment) && typeof apply === "boolean" && Array.isArray(changes) && changes.length > 0,
      "Invalid hosted config request.");
    const target = targets[environment];
    const keys = new Set();
    for (const { key, action, value } of changes) {
      ensure(["set", "clear", "skip"].includes(action) && !keys.has(key), "Invalid hosted config request.");
      keys.add(key);
      validateSelection(environment, key, action);
      if (action === "set") {
        ensure(typeof value === "string" && value.trim(), "Invalid hosted config request.");
        validateValue(key, value);
      }
    }
    const state = hostedFiles(environment, target);
    const patch = patchSettings(state.settings, changes);
    const updated = Buffer.from(patch.updated);
    const details = [`Verified ${environment} / ${target.database} / ${state.commit.slice(0, 12)}.`, ...patch.summary];
    if (apply && !updated.equals(state.originals[0])) {
      const paths = [state.canonical, state.effective];
      let restartTime;
      const verify = () => {
        ensure(realpathSync(state.active) === state.release, "The active release changed during config verification.");
        ensure(paths.every((path, index) => readFile(path, state.owner).equals(state.originals[index])),
          "Hosted settings changed during config verification. Retry after checking the active target.");
      };
      const backupPath = applyConfig({
        paths, originals: state.originals, updated, verify,
        backup: () => backupFiles(environment, state.originals),
        write: (path, bytes) => atomicWrite(path, bytes, state.owner),
        restart: () => {
          ensure(realpathSync(state.active) === state.release, "The active release changed before Passenger restart.");
          const now = new Date();
          restartTime = now.getTime() * 1000;
          utimesSync(state.restart, now, now);
        },
        smoke: (restarted) => restarted
          ? smokeAfterRestart(target, environment, state.active, restartTime)
          : smoke(target, environment) && Boolean(passengerProcesses(state.active)?.length),
      });
      details.push("Settings applied. HTTPS smoke passed.", `Private backup: ${backupPath}`);
    } else {
      details.push(apply ? "No changes needed. Passenger was not restarted." : "Dry-run. No hosted files changed.");
    }
    process.stdout.write(JSON.stringify({ ok: true, details }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof SyncError ? error.message : "Hosted config verification failed. Private diagnostics are withheld." }));
  }
}

function sshRequest(request) {
  const target = targets[request.environment];
  const lock = `/home/${target.account}/goal-hint-private/.release.lock`;
  // Open the existing lock read-only so dry-runs cannot create a file.
  const remote = `test -f ${lock} && test ! -L ${lock} && { /usr/bin/flock --exclusive --wait 20 9 && exec /usr/bin/env -i PATH=/usr/bin:/bin ${node} --input-type=module -; } 9<${lock}`;
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const input = `${source}\nremoteMain(${JSON.stringify(request)});\n`;
  const options = ["-F", "none", "-T", "-i", join(homedir(), ".ssh", "goalhint_vps_setup"),
    "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
    "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"];
  const result = spawnSync("ssh", [...options, `root@${address}`, remote], { input, encoding: "utf8", maxBuffer: 64 * 1024, windowsHide: true });
  ensure(result.status === 0, "The pinned VPS or its release lock could not be reached over strict SSH.");
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw new SyncError("The VPS did not return a valid config result."); }
  if (!response.ok) {
    throw new SyncError(typeof response.error === "string" ? response.error : "The VPS declined the config sync.");
  }
  return response.details;
}

function main() {
  const { values } = parseArgs({ options: {
    target: { type: "string" }, key: { type: "string", multiple: true, default: [] },
    clear: { type: "string", multiple: true, default: [] }, apply: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("Usage: npm run env:sync -- --target staging|production --key KEY [--key KEY ...] [--clear OPTIONAL_KEY ...] [--apply]");
    console.log("Reads next-js/.env.test for staging or next-js/.env.production for production. Dry-run is the default.");
    console.log(`Web keys: ${[...webKeys].join(", ")}`);
    console.log(`Staging-only sandbox keys: ${[...sandboxKeys].join(", ")}`);
    return;
  }
  ensure(Object.hasOwn(targets, values.target), "Use --target staging or --target production.");
  const target = targets[values.target];
  const path = new URL(`../${target.file}`, import.meta.url);
  let text;
  try { text = envText(readFileSync(path)); } catch {
    throw new SyncError(`Read the private next-js/${target.file} file before syncing.`);
  }
  const changes = localChanges(text, values.target, values.key, values.clear);
  const lines = sshRequest({ environment: values.target, changes, apply: values.apply === true });
  for (const line of lines) console.log(line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof SyncError ? error.message : "Invalid arguments or config sync failed. Use --help. Private diagnostics are withheld.");
    process.exitCode = 1;
  }
}
