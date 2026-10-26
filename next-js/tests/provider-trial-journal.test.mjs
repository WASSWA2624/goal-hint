import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { createOfflineTrialPlan, parseTrialPlan } from "../src/server/football/provider-trial-input.ts";
import { TrialJournalError, withTrialJournal } from "../src/server/football/provider-trial-journal.ts";

// Every plan and observation below is synthetic. No provider transport is used.
const NOW = parseUtcInstant("2026-10-08T12:00:00.000Z");
const JOURNAL = "provider-trial-journal.json", LOCK = "provider-trial.lock";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const clock = { now: () => NOW };
const plan = (overrides = {}) => parseTrialPlan({
  version: 1, id: "synthetic-journal", accountId: hash("synthetic-account"),
  competitions: [{ id: 39, season: 2026 }], maxRequests: 5, deadlineAt: NOW + 60_000,
  bounds: { priority: "daily-inputs", timeoutMs: 1000, maxPages: 2, maxRows: 100,
    maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
  freshness: null, tasks: ["first", "second", "third"].map((id) => ({ id, case: "league",
    operation: { kind: "fixtures", query: { competitionId: 39, season: 2026 } }, maxRequests: 3 })), evidence: [],
  ...overrides,
});
const running = (id = "first", reservedRequests = 3) => ({ id, status: "running", startedAt: NOW,
  finishedAt: null, reservedRequests, dispatchedRequests: null, observation: null });
function completed(id = "first", reservedRequests = 3, dispatchedRequests = 1) {
  return { ...running(id, reservedRequests), status: "completed", finishedAt: NOW, dispatchedRequests,
    observation: { taskId: id, source: "synthetic", observedAt: NOW,
      result: { status: "complete", data: [], completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
        provenance: [], requestsDispatched: dispatchedRequests, error: null } } };
}
function deferred(id = "first", reservedRequests = 3, failure = "quota-denied") {
  const state = completed(id, reservedRequests, 0);
  return { ...state, status: "deferred", observation: { ...state.observation, result: { ...state.observation.result,
    status: "failed", completeness: { ...state.observation.result.completeness, complete: false, reasons: [failure] },
    error: { reason: failure, retryable: true } } } };
}
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "goal-hint-trial-journal-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
function reason(expected) {
  return (error) => error instanceof TrialJournalError && error.reason === expected && !error.message.includes("synthetic-account");
}
async function addCompleted(path, trialPlan = plan()) {
  return withTrialJournal(path, trialPlan, async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
    await session.write({ ...session.read(), tasks: [completed()] });
    return session.read();
  }, { clock });
}

test("atomic private writes are durable before returning, immutable on read, and resumed by canonical plan hash", async (t) => {
  const path = await directory(t);
  const trialPlan = plan();
  let sessionOutside;
  const original = await withTrialJournal(path, trialPlan, async (session) => {
    sessionOutside = session;
    assert.equal((await lstat(join(path, LOCK))).isDirectory(), true);
    assert.deepEqual(session.read().tasks, []);
    assert.throws(() => session.read().tasks.push(running()), TypeError);
    await session.write({ ...session.read(), tasks: [running()] });
    assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "running");
    await session.write({ ...session.read(), tasks: [completed()] });
    assert.deepEqual(JSON.parse(await readFile(join(path, JOURNAL), "utf8")), session.read());
    return session.read();
  }, { clock });
  assert.deepEqual(await readdir(path), [JOURNAL]);
  assert.throws(() => sessionOutside.read(), reason("locked"));
  await assert.rejects(sessionOutside.write(original), reason("locked"));
  if (process.platform !== "win32") {
    assert.equal((await lstat(path)).mode & 0o077, 0);
    assert.equal((await lstat(join(path, JOURNAL))).mode & 0o077, 0);
  }
  const reordered = Object.fromEntries(Object.entries(trialPlan).reverse());
  const resumed = await withTrialJournal(path, reordered, async (session) => session.read(), { clock });
  assert.deepEqual(resumed, original);
});

test("concurrent live sessions fail closed and never run the competing operation", async (t) => {
  const path = await directory(t);
  let entered, release;
  const ready = new Promise((done) => { entered = done; });
  const blocked = new Promise((done) => { release = done; });
  const first = withTrialJournal(path, plan(), async () => { entered(); await blocked; return "owner"; }, { clock });
  await ready;
  let ran = false;
  try {
    await assert.rejects(withTrialJournal(path, plan(), async () => { ran = true; }, { clock }), reason("locked"));
    assert.equal(ran, false);
    assert.equal((await lstat(join(path, LOCK))).isDirectory(), true);
  } finally { release(); }
  assert.equal(await first, "owner");
  assert.deepEqual(await readdir(path), [JOURNAL]);
});

test("an unresolved offline plan is journaled without inventing request capacity", async (t) => {
  const path = await directory(t);
  const offline = createOfflineTrialPlan("synthetic-offline-journal");
  const journal = await withTrialJournal(path, offline, async (session) => session.read(), { clock });
  assert.equal(journal.plan.maxRequests, null);
  assert.equal(journal.plan.accountId, null);
  assert.deepEqual(journal.tasks, []);
  assert.deepEqual(await withTrialJournal(path, offline, async (session) => session.read(), { clock }), journal);
});

test("a separate process crash retains the reservation and resumes without reopening uncertain work", async (t) => {
  const path = await directory(t);
  const moduleUrl = pathToFileURL(resolve("src/server/football/provider-trial-journal.ts")).href;
  const source = `import { withTrialJournal } from ${JSON.stringify(moduleUrl)};
    const plan = ${JSON.stringify(plan())};
    await withTrialJournal(${JSON.stringify(path)}, plan, async (session) => {
      await session.write({ ...session.read(), tasks: [${JSON.stringify(running())}] });
      process.stdout.write("journal-ready\\n");
      await new Promise(() => setInterval(() => {}, 1000));
    }, { clock: { now: () => ${NOW} } });`;
  const child = spawn(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", source], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const closed = new Promise((done) => child.once("close", done));
  await new Promise((done, reject) => {
    let output = "", errors = "";
    child.stdout.on("data", (data) => { output += data.toString(); if (output.includes("journal-ready")) done(); });
    child.stderr.on("data", (data) => { errors += data.toString(); });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(`Synthetic journal child exited before readiness: ${errors}`)));
  });
  await assert.rejects(withTrialJournal(path, plan(), async () => {}, { clock }), reason("locked"));
  child.kill("SIGKILL");
  await closed;
  const resumed = await withTrialJournal(path, plan(), async (session) => {
    const journal = session.read();
    assert.deepEqual(journal.tasks[0], { ...running(), status: "uncertain", finishedAt: NOW + 1, dispatchedRequests: null, observation: null });
    assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "uncertain");
    return journal;
  }, { clock: { now: () => NOW + 1 } });
  assert.equal(resumed.tasks[0].reservedRequests, 3);
  await assert.rejects(withTrialJournal(path, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
  }, { clock: { now: () => NOW + 1 } }), reason("invalid-transition"));
  await assert.rejects(withTrialJournal(path, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [...session.read().tasks, { ...running("second"), startedAt: NOW + 1 }] });
  }, { clock: { now: () => NOW + 1 } }), reason("invalid-journal"));
});

test("same-host recovery requires a verified dead owner; foreign, malformed and live lock owners stay locked", async (t) => {
  for (const owner of [
    { version: 1, token: hash("foreign-owner"), hostname: `${hostname()}-foreign`, pid: 2_147_483_647 },
    { version: 1, token: hash("live-owner"), hostname: hostname(), pid: process.pid },
    { token: "malformed-private-token" },
  ]) {
    const path = await directory(t);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(path, LOCK), { mode: 0o700 });
    await writeFile(join(path, LOCK, "owner.json"), JSON.stringify(owner), { mode: 0o600 });
    let ran = false;
    await assert.rejects(withTrialJournal(path, plan(), async () => { ran = true; }, { clock }), reason("locked"));
    assert.equal(ran, false);
    assert.deepEqual(JSON.parse(await readFile(join(path, LOCK, "owner.json"), "utf8")), owner);
  }
});

test("a changed configuration, forged hash or clock regression cannot renew the budget or deadline", async (t) => {
  const path = await directory(t);
  const original = await addCompleted(path);
  for (const trialPlan of [plan({ maxRequests: 6 }), plan({ deadlineAt: NOW + 120_000 }), plan({ accountId: hash("other-account") })]) {
    await assert.rejects(withTrialJournal(path, trialPlan, async () => {}, { clock }), reason("plan-changed"));
  }
  await assert.rejects(withTrialJournal(path, plan(), async () => {}, { clock: { now: () => NOW - 1 } }), reason("invalid-transition"));
  assert.deepEqual(JSON.parse(await readFile(join(path, JOURNAL), "utf8")), original);
  await writeFile(join(path, JOURNAL), JSON.stringify({ ...original, planHash: hash("forged-plan-hash") }), { mode: 0o600 });
  await assert.rejects(withTrialJournal(path, plan(), async () => {}, { clock }), reason("invalid-journal"));
});

test("reservations cannot exceed the remaining charge, while known completion releases only unused reserved capacity", async (t) => {
  const path = await directory(t);
  await assert.rejects(withTrialJournal(path, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
    await session.write({ ...session.read(), tasks: [running(), running("second")] });
  }, { clock }), reason("invalid-journal"));
  const crashState = await withTrialJournal(path, plan(), async (session) => session.read(), { clock });
  assert.equal(crashState.tasks[0].status, "uncertain");
  assert.equal(crashState.tasks.length, 1);
  const knownPath = await directory(t);
  const journal = await withTrialJournal(knownPath, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
    await session.write({ ...session.read(), tasks: [completed("first", 3, 1)] });
    await session.write({ ...session.read(), tasks: [...session.read().tasks, running("second")] });
    await session.write({ ...session.read(), tasks: [session.read().tasks[0], completed("second", 3, 1)] });
    await session.write({ ...session.read(), tasks: [...session.read().tasks, running("third")] });
    return session.read();
  }, { clock });
  assert.equal(journal.tasks.length, 3);
  assert.equal(journal.tasks.reduce((count, state) => count + (state.dispatchedRequests ?? state.reservedRequests), 0), 5);
});

test("task removal, reservation changes, completed observation edits and completion without prior reservation are rejected", async (t) => {
  const transforms = [
    (journal) => ({ ...journal, tasks: [] }),
    (journal) => ({ ...journal, tasks: [{ ...journal.tasks[0], reservedRequests: 2 }] }),
    (journal) => ({ ...journal, tasks: [{ ...journal.tasks[0], observation: { ...journal.tasks[0].observation,
      result: { ...journal.tasks[0].observation.result, data: [{ name: "changed synthetic observation" }] } } }] }),
    (journal) => ({ ...journal, tasks: [...journal.tasks, completed("second")] }),
    (journal) => ({ ...journal, tasks: [{ ...journal.tasks[0], status: "running", finishedAt: null, dispatchedRequests: null, observation: null }] }),
  ];
  for (const transform of transforms) {
    const path = await directory(t);
    const original = await addCompleted(path);
    await assert.rejects(withTrialJournal(path, plan(), async (session) => session.write(transform(session.read())), { clock }), reason("invalid-transition"));
    assert.deepEqual(JSON.parse(await readFile(join(path, JOURNAL), "utf8")), original);
  }
});

test("actual dispatches cannot exceed reservations or disagree with the observation result", async (t) => {
  for (const state of [completed("first", 3, 4), { ...completed(), dispatchedRequests: 2 }]) {
    const path = await directory(t);
    await assert.rejects(withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), tasks: [running()] });
      await session.write({ ...session.read(), tasks: [state] });
    }, { clock }), reason("invalid-journal"));
    assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "running");
  }
});

test("an active reservation is immutable and journal timestamps cannot move backwards or into the future", async (t) => {
  for (const changed of [
    (journal) => ({ ...journal, tasks: [{ ...journal.tasks[0], reservedRequests: 2 }] }),
    (journal) => ({ ...journal, updatedAt: NOW + 1 }),
    (journal) => ({ ...journal, updatedAt: NOW - 1 }),
  ]) {
    const path = await directory(t);
    await assert.rejects(withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), tasks: [running()] });
      await session.write(changed(session.read()));
    }, { clock }), (error) => error instanceof TrialJournalError && ["invalid-journal", "invalid-transition"].includes(error.reason));
    const stored = JSON.parse(await readFile(join(path, JOURNAL), "utf8"));
    assert.equal(stored.tasks[0].reservedRequests, 3);
    assert.equal(stored.updatedAt, NOW);
  }
});

test("a verified zero-dispatch quota wait resumes the same task without renewing its plan or consuming capacity twice", async (t) => {
  for (const failure of ["quota-denied", "shared-work-pending"]) {
    const path = await directory(t);
    const waiting = await withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), tasks: [running()] });
      await session.write({ ...session.read(), tasks: [deferred("first", 3, failure)] });
      // A task awaiting quota has spent nothing, so a different task may reserve capacity.
      await session.write({ ...session.read(), tasks: [...session.read().tasks, running("second")] });
      await session.write({ ...session.read(), tasks: [session.read().tasks[0], completed("second", 3, 2)] });
      return session.read();
    }, { clock });
    assert.equal(waiting.tasks[0].status, "deferred");
    assert.equal(waiting.tasks[0].dispatchedRequests, 0);
    const resumed = await withTrialJournal(path, plan(), async (session) => {
      assert.equal(session.read().tasks[0].status, "deferred");
      const retried = { ...running("first", 2), startedAt: NOW + 1 };
      await session.write({ ...session.read(), updatedAt: NOW + 1, tasks: [retried, session.read().tasks[1]] });
      assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "running");
      const done = { ...completed("first", 2, 1), startedAt: NOW + 1, finishedAt: NOW + 1,
        observation: { ...completed("first", 2, 1).observation, observedAt: NOW + 1 } };
      await session.write({ ...session.read(), tasks: [done, session.read().tasks[1]] });
      return session.read();
    }, { clock: { now: () => NOW + 1 } });
    assert.equal(resumed.tasks[0].status, "completed");
    assert.equal(resumed.tasks[0].reservedRequests, 2);
    assert.equal(resumed.planHash, waiting.planHash);
    assert.equal(resumed.plan.deadlineAt, waiting.plan.deadlineAt);
    assert.equal(resumed.tasks.reduce((total, state) => total + state.dispatchedRequests, 0), 3);
  }
});

test("deferral cannot erase actual or uncertain I/O, misclassify another failure, or bypass a new durable intent", async (t) => {
  for (const state of [
    { ...deferred(), dispatchedRequests: 1, observation: { ...deferred().observation,
      result: { ...deferred().observation.result, requestsDispatched: 1 } } },
    deferred("first", 3, "authentication-error"),
    { ...deferred(), observation: { ...deferred().observation, result: { ...deferred().observation.result, status: "complete" } } },
  ]) {
    const path = await directory(t);
    await assert.rejects(withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), tasks: [running()] });
      await session.write({ ...session.read(), tasks: [state] });
    }, { clock }), reason("invalid-journal"));
    assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "running");
  }
  for (const change of [
    () => completed(),
    () => ({ ...running(), startedAt: NOW - 1 }),
    (state) => ({ ...state, finishedAt: NOW + 1 }),
  ]) {
    const path = await directory(t);
    await withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), tasks: [running()] });
      await session.write({ ...session.read(), tasks: [deferred()] });
    }, { clock });
    await assert.rejects(withTrialJournal(path, plan(), async (session) => {
      await session.write({ ...session.read(), updatedAt: NOW + 1, tasks: [change(session.read().tasks[0])] });
    }, { clock: { now: () => NOW + 1 } }), (error) => error instanceof TrialJournalError && ["invalid-journal", "invalid-transition"].includes(error.reason));
    assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "deferred");
  }
  const uncertainPath = await directory(t);
  await withTrialJournal(uncertainPath, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
  }, { clock });
  await assert.rejects(withTrialJournal(uncertainPath, plan(), async (session) => {
    assert.equal(session.read().tasks[0].status, "uncertain");
    await session.write({ ...session.read(), tasks: [deferred()] });
  }, { clock }), reason("invalid-transition"));
  assert.equal(JSON.parse(await readFile(join(uncertainPath, JOURNAL), "utf8")).tasks[0].status, "uncertain");
});

test("reopening a deferred task charges its new reservation before I/O and still respects the total cap", async (t) => {
  const path = await directory(t);
  await withTrialJournal(path, plan(), async (session) => {
    await session.write({ ...session.read(), tasks: [running()] });
    await session.write({ ...session.read(), tasks: [deferred()] });
    await session.write({ ...session.read(), tasks: [...session.read().tasks, running("second")] });
  }, { clock });
  await assert.rejects(withTrialJournal(path, plan(), async (session) => {
    assert.equal(session.read().tasks[1].status, "uncertain");
    await session.write({ ...session.read(), tasks: [running("first", 3), session.read().tasks[1]] });
  }, { clock }), reason("invalid-journal"));
  assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "deferred");
});

test("malformed, structurally incomplete and oversized persisted journals fail closed without exposing private contents", async (t) => {
  for (const contents of ["{ malformed-private-contents", JSON.stringify({ version: 1, private: "hidden" }), "x".repeat(32 * 1024 * 1024 + 1)]) {
    const path = await directory(t);
    await writeFile(join(path, JOURNAL), contents, { mode: 0o600 });
    let error;
    try { await withTrialJournal(path, plan(), async () => {}, { clock }); } catch (caught) { error = caught; }
    assert.ok(reason("invalid-journal")(error));
    assert.equal(error.message.includes("malformed-private-contents"), false);
    assert.equal(await readFile(join(path, JOURNAL), "utf8"), contents);
    assert.deepEqual(await readdir(path), [JOURNAL]);
  }
});

test("parallel writes serialize transition checks and pending writes finish before the lock is released", async (t) => {
  const path = await directory(t);
  await withTrialJournal(path, plan(), async (session) => {
    // Deliberately leave this promise pending to exercise the scope durability guarantee.
    session.write({ ...session.read(), tasks: [running()] });
  }, { clock });
  assert.equal(JSON.parse(await readFile(join(path, JOURNAL), "utf8")).tasks[0].status, "running");
  assert.deepEqual(await readdir(path), [JOURNAL]);
  const nextPath = await directory(t);
  await assert.rejects(withTrialJournal(nextPath, plan(), async (session) => {
    const original = session.read();
    const first = session.write({ ...original, tasks: [running()] });
    const second = session.write({ ...original, tasks: [running("second")] });
    await first;
    await second;
  }, { clock }), reason("invalid-transition"));
  assert.deepEqual(JSON.parse(await readFile(join(nextPath, JOURNAL), "utf8")).tasks.map((state) => state.id), ["first"]);
});

test("relative/root directories and symlinks in ancestors, journal or lock paths are rejected without touching targets", async (t) => {
  await assert.rejects(withTrialJournal("relative-private-directory", plan(), async () => {}, { clock }), reason("unsafe-path"));
  const { parse } = await import("node:path");
  await assert.rejects(withTrialJournal(parse(resolve(".")).root, plan(), async () => {}, { clock }), reason("unsafe-path"));
  const root = await directory(t), target = await directory(t);
  const marker = join(target, "marker.json");
  await writeFile(marker, "synthetic untouched target", { mode: 0o600 });
  const link = join(root, "linked-directory");
  try { await symlink(target, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Windows does not permit symlink creation for this account."); return; }
    throw error;
  }
  await assert.rejects(withTrialJournal(join(link, "child"), plan(), async () => {}, { clock }), reason("unsafe-path"));
  const journalPath = await directory(t);
  try { await symlink(marker, join(journalPath, JOURNAL), "file"); }
  catch (error) {
    if (!(process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code))) throw error;
    t.diagnostic("Windows file symlink privilege unavailable; ancestor junction coverage ran.");
  }
  if ((await readdir(journalPath)).includes(JOURNAL)) await assert.rejects(withTrialJournal(journalPath, plan(), async () => {}, { clock }), reason("unsafe-path"));
  const lockPath = await directory(t);
  await symlink(target, join(lockPath, LOCK), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(withTrialJournal(lockPath, plan(), async () => {}, { clock }), reason("unsafe-path"));
  assert.equal(await readFile(marker, "utf8"), "synthetic untouched target");
  assert.deepEqual(await readdir(target), ["marker.json"]);
});

test("a replaced lock token is never removed by the former owner", async (t) => {
  const path = await directory(t);
  const replacement = { version: 1, token: hash("synthetic-replacement-owner"), hostname: hostname(), pid: process.pid };
  await assert.rejects(withTrialJournal(path, plan(), async () => {
    await writeFile(join(path, LOCK, "owner.json"), JSON.stringify(replacement), { mode: 0o600 });
  }, { clock }), reason("locked"));
  assert.deepEqual(JSON.parse(await readFile(join(path, LOCK, "owner.json"), "utf8")), replacement);
  assert.equal((await lstat(join(path, LOCK))).isDirectory(), true);
});

test("existing public directory or file modes are rejected on systems that enforce POSIX permissions", async (t) => {
  if (process.platform === "win32") { t.skip("Windows uses inherited filesystem ACLs rather than POSIX modes."); return; }
  const path = await directory(t);
  await chmod(path, 0o755);
  await assert.rejects(withTrialJournal(path, plan(), async () => {}, { clock }), reason("unsafe-path"));
  await chmod(path, 0o700);
  await writeFile(join(path, JOURNAL), "{}", { mode: 0o644 });
  await assert.rejects(withTrialJournal(path, plan(), async () => {}, { clock }), reason("unsafe-path"));
});
