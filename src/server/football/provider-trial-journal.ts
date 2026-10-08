import "server-only";

import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import { utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { PROVIDER_TRIAL_VERSION, type TrialJournal, type TrialPlan, type TrialTaskState } from "./provider-trial-contract.ts";
import { parseTrialPlan } from "./provider-trial-input.ts";

const JOURNAL_FILENAME = "provider-trial-journal.json";
const LOCK_DIRECTORY = "provider-trial.lock";
const OWNER_FILENAME = "owner.json";
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

type JournalErrorReason = "locked" | "unsafe-path" | "invalid-journal" | "plan-changed" | "invalid-transition" | "storage-error";
export class TrialJournalError extends Error {
  readonly reason: JournalErrorReason;
  constructor(reason: JournalErrorReason) {
    super(`Provider trial journal: ${reason}.`);
    this.name = "TrialJournalError";
    this.reason = reason;
  }
}

type LockOwner = Readonly<{ version: 1; token: string; hostname: string; pid: number }>;
type RecordValue = Record<string, unknown>;

function fail(reason: JournalErrorReason): never { throw new TrialJournalError(reason); }
function errno(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
function instant(value: unknown): value is UtcInstant {
  if (typeof value !== "number") return false;
  try { utcInstantFromEpochMilliseconds(value); return true; } catch { return false; }
}

/** Stable JSON hashing ignores property insertion order, never array order. */
function canonical(value: unknown, seen = new Set<object>(), depth = 0): string {
  if (depth > 64) fail("invalid-journal");
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || seen.has(value)) fail("invalid-journal");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) fail("invalid-journal");
  seen.add(value);
  const encoded = Array.isArray(value)
    ? `[${Array.from(value, (item) => canonical(item, seen, depth + 1)).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as RecordValue)[key], seen, depth + 1)}`).join(",")}}`;
  seen.delete(value);
  return encoded;
}

function snapshot<T>(value: T): T {
  const encoded = canonical(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_FILE_BYTES) fail("invalid-journal");
  try { return JSON.parse(encoded) as T; } catch { return fail("invalid-journal"); }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function hashPlan(plan: TrialPlan): string { return createHash("sha256").update(canonical(plan)).digest("hex"); }

function validObservation(value: unknown, state: TrialTaskState): boolean {
  if (!record(value) || !exactKeys(value, ["taskId", "source", "observedAt", "result"]) || value.taskId !== state.id ||
      (value.source !== "live-provider" && value.source !== "synthetic") || !instant(value.observedAt) ||
      state.finishedAt === null || value.observedAt < state.startedAt || value.observedAt > state.finishedAt || !record(value.result)) return false;
  const result = value.result;
  if (!exactKeys(result, ["status", "data", "completeness", "provenance", "requestsDispatched", "error"]) ||
      !["complete", "partial", "failed"].includes(String(result.status)) || !Array.isArray(result.data) ||
      !Array.isArray(result.provenance) || result.requestsDispatched !== state.dispatchedRequests || !record(result.completeness)) return false;
  const completeness = result.completeness;
  return exactKeys(completeness, ["complete", "reasons", "missingIds", "missingCoverage", "invalidRows"]) &&
    typeof completeness.complete === "boolean" && Array.isArray(completeness.reasons) && completeness.reasons.every((item) => typeof item === "string") &&
    Array.isArray(completeness.missingCoverage) && completeness.missingCoverage.every((item) => typeof item === "string") &&
    Array.isArray(completeness.missingIds) && completeness.missingIds.every((item) => integer(item, 1)) &&
    integer(completeness.invalidRows) && (result.error === null || (record(result.error) && typeof result.error.reason === "string" && typeof result.error.retryable === "boolean"));
}

function validateJournal(value: unknown, plan: TrialPlan, planHash: string): TrialJournal {
  if (!record(value) || !exactKeys(value, ["version", "planHash", "plan", "createdAt", "updatedAt", "tasks"]) ||
      value.version !== PROVIDER_TRIAL_VERSION || !instant(value.createdAt) || !instant(value.updatedAt) ||
      value.createdAt > value.updatedAt || !Array.isArray(value.tasks)) fail("invalid-journal");
  let storedPlan: TrialPlan;
  try { storedPlan = parseTrialPlan(value.plan); } catch { return fail("invalid-journal"); }
  if (typeof value.planHash !== "string" || !TOKEN_PATTERN.test(value.planHash) || value.planHash !== hashPlan(storedPlan)) fail("invalid-journal");
  if (value.planHash !== planHash || canonical(storedPlan) !== canonical(plan)) fail("plan-changed");
  const known = new Map(plan.tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  let charged = 0;
  for (const entry of value.tasks) {
    if (!record(entry) || !exactKeys(entry, ["id", "status", "startedAt", "finishedAt", "reservedRequests", "dispatchedRequests", "observation"]) ||
        typeof entry.id !== "string" || seen.has(entry.id) || !known.has(entry.id) || !instant(entry.startedAt) ||
        entry.startedAt < value.createdAt || entry.startedAt > value.updatedAt || !integer(entry.reservedRequests, 1) ||
        entry.reservedRequests > known.get(entry.id)!.maxRequests) fail("invalid-journal");
    seen.add(entry.id);
    if (entry.status === "running") {
      if (entry.finishedAt !== null || entry.dispatchedRequests !== null || entry.observation !== null) fail("invalid-journal");
    } else if (entry.status === "completed" || entry.status === "uncertain" || entry.status === "deferred") {
      if (!instant(entry.finishedAt) || entry.finishedAt < entry.startedAt || entry.finishedAt > value.updatedAt) fail("invalid-journal");
      if (entry.status === "uncertain") {
        if (entry.dispatchedRequests !== null || entry.observation !== null) fail("invalid-journal");
      } else if (!integer(entry.dispatchedRequests) || entry.dispatchedRequests > entry.reservedRequests || !validObservation(entry.observation, entry as TrialTaskState)) {
        fail("invalid-journal");
      }
      if (entry.status === "deferred") {
        const observation = entry.observation as TrialTaskState["observation"];
        if (entry.dispatchedRequests !== 0 || observation?.result.status !== "failed" ||
            !["quota-denied", "shared-work-pending"].includes(observation.result.error?.reason ?? "")) fail("invalid-journal");
      }
    } else fail("invalid-journal");
    charged += entry.status === "completed" || entry.status === "deferred" ? entry.dispatchedRequests as number : entry.reservedRequests;
    if (!Number.isSafeInteger(charged)) fail("invalid-journal");
  }
  if (charged > (plan.maxRequests ?? 0)) fail("invalid-journal");
  return value as TrialJournal;
}

function validateTransition(previous: TrialJournal, next: TrialJournal, now: UtcInstant) {
  if (next.createdAt !== previous.createdAt || next.updatedAt < previous.updatedAt || next.updatedAt > now) fail("invalid-transition");
  const nextTasks = new Map(next.tasks.map((task) => [task.id, task]));
  const previousTasks = new Set(previous.tasks.map((task) => task.id));
  for (const old of previous.tasks) {
    const task = nextTasks.get(old.id);
    if (!task) fail("invalid-transition");
    if (old.status === "deferred") {
      if (canonical(old) !== canonical(task) && (task.status !== "running" || task.startedAt < previous.updatedAt)) fail("invalid-transition");
    } else {
      if (task.startedAt !== old.startedAt || task.reservedRequests !== old.reservedRequests) fail("invalid-transition");
      if (old.status !== "running" && canonical(old) !== canonical(task)) fail("invalid-transition");
    }
  }
  for (const task of next.tasks) {
    if (!previousTasks.has(task.id) && (task.status !== "running" || task.startedAt < previous.updatedAt)) fail("invalid-transition");
  }
}

/** Check every existing ancestor: junctions and symlinks are never followed. */
async function ensureDirectory(directory: string, create: boolean) {
  const root = parse(directory).root;
  let current = root;
  for (const part of directory.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    let status;
    try { status = await lstat(current); } catch (error) {
      if (errno(error) !== "ENOENT" || !create) throw error;
      try { await mkdir(current, { mode: 0o700 }); } catch (creationError) { if (errno(creationError) !== "EEXIST") throw creationError; }
      status = await lstat(current);
    }
    if (status.isSymbolicLink() || !status.isDirectory()) fail("unsafe-path");
  }
  if (process.platform !== "win32") {
    const status = await lstat(directory);
    if ((status.mode & 0o077) !== 0) fail("unsafe-path");
  }
}
async function normalFile(path: string, allowMissing = false) {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1 ||
        (process.platform !== "win32" && (status.mode & 0o077) !== 0)) fail("unsafe-path");
    return status;
  } catch (error) { if (allowMissing && errno(error) === "ENOENT") return null; throw error; }
}
async function syncDirectory(directory: string) {
  let handle;
  try { handle = await open(directory, constants.O_RDONLY); await handle.sync(); }
  catch (error) {
    // Windows does not expose directory fsync through Node. Files are still fsynced before and after rename.
    if (process.platform !== "win32" || !["EISDIR", "EPERM", "EACCES", "EINVAL"].includes(errno(error) ?? "")) throw error;
  } finally { await handle?.close(); }
}
async function readJson(path: string, limit = MAX_FILE_BYTES): Promise<unknown> {
  const before = await normalFile(path);
  if (before!.size > limit) fail("invalid-journal");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before!.dev || opened.ino !== before!.ino) fail("unsafe-path");
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65_536, limit + 1 - size));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > limit) fail("invalid-journal");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return fail("invalid-journal"); }
  } finally { await handle.close(); }
}
async function readOwner(lockDirectory: string): Promise<LockOwner> {
  await ensureDirectory(lockDirectory, false);
  let owner;
  try { owner = await readJson(join(lockDirectory, OWNER_FILENAME), 4096); }
  catch (error) { if (error instanceof TrialJournalError && error.reason === "unsafe-path") throw error; return fail("locked"); }
  if (!record(owner) || !exactKeys(owner, ["version", "token", "hostname", "pid"]) || owner.version !== 1 ||
      typeof owner.token !== "string" || !TOKEN_PATTERN.test(owner.token) || typeof owner.hostname !== "string" ||
      owner.hostname.length === 0 || owner.hostname.length > 256 || !integer(owner.pid, 1)) fail("locked");
  return owner as LockOwner;
}
function isDeadLocalOwner(owner: LockOwner): boolean {
  if (owner.hostname !== hostname()) return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { return errno(error) === "ESRCH"; }
}
async function ownedLock(lockDirectory: string, owner: LockOwner) {
  if (canonical(await readOwner(lockDirectory)) !== canonical(owner)) fail("locked");
}
async function acquireLock(directory: string): Promise<LockOwner> {
  const lockDirectory = join(directory, LOCK_DIRECTORY);
  const owner: LockOwner = { version: 1, token: randomBytes(32).toString("hex"), hostname: hostname(), pid: process.pid };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await mkdir(lockDirectory, { mode: 0o700 });
      const handle = await open(join(lockDirectory, OWNER_FILENAME), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
      try { await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await syncDirectory(lockDirectory);
      await syncDirectory(directory);
      return owner;
    } catch (error) { if (errno(error) !== "EEXIST") throw error; }
    const previousOwner = await readOwner(lockDirectory);
    if (!isDeadLocalOwner(previousOwner)) fail("locked");
    // One token-specific claimant can quarantine a stale lock. A stale contender
    // must recheck the owner, so it cannot rename a newly acquired live lock.
    const claimName = `reclaim-${previousOwner.token}`;
    const claim = join(lockDirectory, claimName);
    try { await mkdir(claim, { mode: 0o700 }); } catch (error) { if (errno(error) === "EEXIST" || errno(error) === "ENOENT") fail("locked"); throw error; }
    const quarantine = join(directory, `${LOCK_DIRECTORY}.recovered-${owner.token}`);
    try {
      await ownedLock(lockDirectory, previousOwner);
      if (!isDeadLocalOwner(previousOwner)) fail("locked");
      await rename(lockDirectory, quarantine);
      await ownedLock(quarantine, previousOwner);
      const contents = await readdir(quarantine);
      if (contents.length !== 2 || !contents.includes(OWNER_FILENAME) || !contents.includes(claimName)) fail("locked");
      await rmdir(join(quarantine, claimName));
      await unlink(join(quarantine, OWNER_FILENAME));
      await rmdir(quarantine);
      await syncDirectory(directory);
    } catch (error) {
      // The claimant only removes its own empty child; never another owner's lock.
      try { await rmdir(claim); } catch { /* Conservative residue keeps recovery closed. */ }
      throw error;
    }
  }
  return fail("locked");
}

async function releaseLock(directory: string, owner: LockOwner) {
  const lockDirectory = join(directory, LOCK_DIRECTORY);
  await ensureDirectory(directory, false);
  await ownedLock(lockDirectory, owner);
  const contents = await readdir(lockDirectory);
  if (contents.length !== 1 || contents[0] !== OWNER_FILENAME) fail("locked");
  await unlink(join(lockDirectory, OWNER_FILENAME));
  await rmdir(lockDirectory);
  await syncDirectory(directory);
}
async function persist(directory: string, owner: LockOwner, journal: TrialJournal) {
  await ensureDirectory(directory, false);
  await ownedLock(join(directory, LOCK_DIRECTORY), owner);
  const destination = join(directory, JOURNAL_FILENAME);
  await normalFile(destination, true);
  const temporary = join(directory, `${JOURNAL_FILENAME}.${randomBytes(32).toString("hex")}.tmp`);
  const encoded = `${JSON.stringify(journal)}\n`;
  if (Buffer.byteLength(encoded, "utf8") > MAX_FILE_BYTES) fail("invalid-journal");
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  let replaced = false;
  try {
    await handle.writeFile(encoded, "utf8");
    await handle.sync();
    await handle.close();
    await ensureDirectory(directory, false);
    await ownedLock(join(directory, LOCK_DIRECTORY), owner);
    await normalFile(destination, true);
    await rename(temporary, destination);
    replaced = true;
    // File durability also covers platforms that cannot fsync the directory.
    const committed = await open(destination, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
    try { await committed.sync(); } finally { await committed.close(); }
    await syncDirectory(directory);
  } finally {
    await handle.close();
    if (!replaced) { try { await normalFile(temporary); await unlink(temporary); } catch { /* Preserve the original write failure. */ } }
  }
}

export async function withTrialJournal<T>(
  directory: string,
  planInput: TrialPlan,
  operation: (session: Readonly<{ read(): TrialJournal; write(journal: TrialJournal): Promise<void> }>) => Promise<T>,
  { clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) } }: Readonly<{ clock?: Clock }> = {},
): Promise<T> {
  if (!isAbsolute(directory) || resolve(directory) === parse(resolve(directory)).root) fail("unsafe-path");
  const taskDirectory = resolve(directory);
  let plan: TrialPlan;
  try { plan = parseTrialPlan(snapshot(planInput)); } catch { return fail("invalid-journal"); }
  const planHash = hashPlan(plan);
  let owner: LockOwner | null = null;
  let active = false;
  let writes: Promise<void> = Promise.resolve();
  let operationError: unknown;
  try {
    await ensureDirectory(taskDirectory, true);
    // A journal symlink is rejected before creating a lock or overwriting anything.
    const journalPath = join(taskDirectory, JOURNAL_FILENAME);
    await normalFile(journalPath, true);
    owner = await acquireLock(taskDirectory);
    const now = clock.now();
    if (!instant(now)) fail("invalid-journal");
    let current: TrialJournal;
    if (await normalFile(journalPath, true)) {
      current = validateJournal(await readJson(journalPath), plan, planHash);
      if (now < current.updatedAt) fail("invalid-transition");
      if (current.tasks.some((task) => task.status === "running")) {
        current = { ...current, updatedAt: now, tasks: current.tasks.map((task) => task.status === "running"
          ? { ...task, status: "uncertain", finishedAt: now, dispatchedRequests: null, observation: null } : task) };
        await persist(taskDirectory, owner, current);
      }
    } else {
      current = { version: PROVIDER_TRIAL_VERSION, planHash, plan, createdAt: now, updatedAt: now, tasks: [] };
      await persist(taskDirectory, owner, current);
    }
    current = freeze(snapshot(current));
    active = true;
    const lockOwner = owner;
    const session = Object.freeze({
      read(): TrialJournal { if (!active) fail("locked"); return current; },
      write(next: TrialJournal): Promise<void> {
        if (!active) return Promise.reject(new TrialJournalError("locked"));
        let saved: TrialJournal;
        try { saved = snapshot(next); }
        catch (error) { return Promise.reject(error instanceof TrialJournalError ? error : new TrialJournalError("invalid-journal")); }
        const write = writes.then(async () => {
          if (!active) fail("locked");
          const checked = validateJournal(saved, plan, planHash);
          const writeNow = clock.now();
          if (!instant(writeNow)) fail("invalid-transition");
          validateTransition(current, checked, writeNow);
          try { await persist(taskDirectory, lockOwner, checked); }
          catch (error) { if (error instanceof TrialJournalError) throw error; throw new TrialJournalError("storage-error"); }
          current = freeze(checked);
        });
        writes = write;
        void write.catch(() => {});
        return write;
      },
    });
    let result: T;
    try { result = await operation(session); } catch (error) { operationError = error; throw error; }
    await writes;
    return result;
  } catch (error) {
    if (error instanceof TrialJournalError || error === operationError) throw error;
    throw new TrialJournalError("storage-error");
  } finally {
    await writes.catch(() => {});
    active = false;
    if (owner) {
      try { await releaseLock(taskDirectory, owner); }
      catch (error) { if (error instanceof TrialJournalError) throw error; throw new TrialJournalError("storage-error"); }
    }
  }
}
