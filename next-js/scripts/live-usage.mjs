import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { readLocalFootballUsage } from "../src/server/live/live-usage.ts";
import { openLocalFootballTarget } from "./lib/local-football-target.mjs";

const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const at = (value) => value === null ? "unobserved" : time.format(new Date(value));
const quantity = (value) => value === null ? "unconfirmed" : value.toLocaleString("en-GB");
const usage = "Usage: npm run live:usage -- [--watch | --days 1–14] [--json]";
const unavailable = "Local API usage is unavailable. Start the local snapshot and retry. Private diagnostics are withheld.";

function render(report) {
  const { freshness, days } = report;
  const lines = [`API-Football usage at ${at(report.checkedAt)} Kampala time`];
  for (const day of days) {
    const { provider, local } = day;
    lines.push("", `Provider day ${at(day.startsAt)} to ${at(day.resetsAt)} Kampala time`,
      provider === null ? "Account-wide usage was unobserved for this provider day."
        : `Account-wide  ${quantity(provider.used)} used / ${quantity(provider.limit)} daily limit  ·  ${quantity(provider.remaining)} remaining (observed ${at(provider.observedAt)})`,
      `Local launches  ${quantity(local.launches)}  ·  Retries ${quantity(local.retries)}  ·  Rate-limited ${quantity(local.rateLimited)}  ·  Provider errors ${quantity(local.providerErrors)}  ·  Unresolved ${quantity(local.uncertain)}`,
      `Local limiter  ${quantity(local.remaining)} remaining under the ${quantity(local.limit)} ceiling, including an essential reserve of up to ${quantity(local.essentialReserve)}`);
    for (const group of local.breakdown) {
      lines.push(`  ${quantity(group.launches).padStart(7)}  ${group.endpoint}  ${group.workload}`);
    }
  }
  lines.push("", `Stored data  ·  ${quantity(freshness.activeFixtures)} live fixtures  ·  ${quantity(freshness.resultBacklog)} unapplied result batches`,
    `  Results ${at(freshness.latestResult)}  ·  Match details ${at(freshness.latestMatchDetails)}`,
    `  Pre-match odds ${at(freshness.latestPreMatchOdds)}  ·  Successful in-play odds poll ${at(freshness.latestInPlayPoll)}`);
  return lines.join("\n");
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { watch: { type: "boolean" }, json: { type: "boolean" }, days: { type: "string" },
      help: { type: "boolean", short: "h" } } }));
  } catch { throw new Error(usage); }
  if (values.help) { console.log(usage); return; }
  const days = Number(values.days ?? "1");
  if (!Number.isSafeInteger(days) || days < 1 || days > 14 || values.watch && days !== 1) throw new Error(usage);
  const stop = new AbortController(), abort = () => stop.abort();
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  let database;
  try {
    do {
      try {
        database ??= (await openLocalFootballTarget()).database;
        const report = await readLocalFootballUsage(database, days);
        if (values.watch && !values.json && process.stdout.isTTY) console.clear();
        console.log(values.json ? JSON.stringify(report) : render(report));
      } catch (error) {
        if (!values.watch) throw error;
        console.error("Waiting for the local snapshot database. Retrying in 30 seconds.");
        await database?.disconnect().catch(() => {});
        database = undefined;
      }
      if (values.watch) await delay(30_000, undefined, { signal: stop.signal }).catch((error) => {
        if (!stop.signal.aborted) throw error;
      });
    } while (values.watch && !stop.signal.aborted);
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    await database?.disconnect();
  }
}

main().catch((error) => {
  console.error(error?.message === usage ? usage : unavailable);
  process.exitCode = 1;
});
