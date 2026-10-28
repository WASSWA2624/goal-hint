/** Stream exact raw provider envelopes to ignored gzip files; never load the dataset at once. */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { demoApiFootballResponse, demoFixturesForDate, DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY } from "../src/server/demo/api-football.ts";

const options = { from: DEMO_START_DATE, to: DEMO_END_DATE, details: false, asOf: Date.now() };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (key === "--details") options.details = true;
  else if (["--from", "--to", "--as-of"].includes(key) && args[index + 1]) {
    const value = args[++index];
    if (key === "--as-of") options.asOf = Date.parse(value);
    else options[key.slice(2)] = value;
  } else throw new Error("Usage: npm run demo:export -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--as-of ISO-INSTANT] [--details]");
}
for (const date of [options.from, options.to]) {
  if (!/^2026-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date < DEMO_START_DATE || date > DEMO_END_DATE) {
    throw new Error(`Dates must be valid calendar dates from ${DEMO_START_DATE} to ${DEMO_END_DATE}.`);
  }
}
if (options.from > options.to || !Number.isFinite(options.asOf)) throw new Error("Invalid export range or observation time.");
const directory = resolve(fileURLToPath(new URL("../", import.meta.url)), ".goal-hint", "demo-export", options.details ? "details" : "fixtures");
await mkdir(directory, { recursive: true });
let days = 0, fixtures = 0;
for (let epoch = Date.parse(`${options.from}T00:00:00Z`); epoch <= Date.parse(`${options.to}T00:00:00Z`); epoch += 86_400_000) {
  const date = new Date(epoch).toISOString().slice(0, 10);
  const rows = demoFixturesForDate(date, options.asOf);
  if (rows.length < 500) throw new Error(`Daily coverage below 500 on ${date}.`);
  async function* lines() {
    if (options.details) {
      for (const row of rows) yield `${JSON.stringify(demoApiFootballResponse("fixtures", { id: String(row.fixture.id) }, options.asOf))}\n`;
    } else yield `${JSON.stringify(demoApiFootballResponse("fixtures", { date, timezone: "Africa/Kampala" }, options.asOf))}\n`;
  }
  // Detailed fixture payloads are large and repetitive; fast compression keeps
  // full-range exports practical without retaining any complete day in memory.
  await pipeline(lines(), createGzip({ level: options.details ? 1 : 6 }), createWriteStream(resolve(directory, `${date}.ndjson.gz`)));
  fixtures += rows.length;
  days++;
  if (days % 10 === 0 || date === options.to) process.stdout.write(`Exported ${days} days / ${fixtures} fixtures through ${date}.\n`);
}
await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify({ synthetic: true, provider: "api-football-v3", ...options,
  days, fixtures, matchesPerDay: DEMO_MATCHES_PER_DAY, format: "gzip NDJSON of unchanged API-Football response envelopes" }, null, 2)}\n`);
process.stdout.write(`Saved ${fixtures} fixtures to ${directory}\n`);
