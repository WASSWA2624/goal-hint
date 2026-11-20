import { parseArgs } from "node:util";
import { setTimeout as wait } from "node:timers/promises";
import { captureLocalForecasts } from "../src/server/intelligence/local-forecast-shadow.ts";
import { openForecastDatabase } from "./lib/forecast-database-target.mjs";

let database;
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const { values } = parseArgs({ options: { environment: { type: "string", default: "development" },
    limit: { type: "string", default: "50" }, watch: { type: "boolean", default: false } } });
  if (!/^(?:[1-9]\d?|100)$/u.test(values.limit)) throw new RangeError("Use a fixture limit from 1 to 100.");
  if (values.watch && values.environment !== "development") throw new Error("Use a bounded one-shot timer on hosted environments.");
  database = await openForecastDatabase(values.environment);
  async function sweep() {
    const result = await captureLocalForecasts(database, Number(values.limit), controller.signal);
    console.log(JSON.stringify({ environment: values.environment, mode: "shadow", publish: false, ...result }));
    return result.selected > 0 && result.failed === result.selected;
  }
  if (values.watch) {
    // The development launcher keeps this pipe open for the lifetime of its owned database.
    if (!process.stdin.isTTY) process.stdin.once("end", stop).resume();
    while (!controller.signal.aborted) {
      try { await sweep(); }
      catch { console.error("The private local forecast sweep is temporarily unavailable."); }
      try { await wait(60_000, undefined, { signal: controller.signal }); }
      catch (error) { if (!controller.signal.aborted) throw error; }
    }
  } else if (await sweep()) process.exitCode = 1;
} catch {
  console.error("The private local forecast sweep could not run for the selected database.");
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  process.stdin.off("end", stop);
  if (process.stdin.readableFlowing) process.stdin.pause();
  await database?.disconnect().catch(() => { process.exitCode = 1; });
}
