import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createFootballHistorySource } from "../../src/server/football/history-source.ts";
import { openLocalFootballTarget } from "./local-football-target.mjs";

/** Reuse complete pages saved by the owned snapshot fetcher, without starting a provider runtime. */
export async function seedFootballHistory(signal) {
  const { database, directory } = await openLocalFootballTarget();
  const source = createFootballHistorySource(database);
  const root = join(directory, "..", "real-football-import");
  let examined = 0, added = 0, rows = 0;
  try {
    for (const folder of await readdir(root, { withFileTypes: true })) {
      if (!folder.isDirectory() || !/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/u.test(folder.name)) continue;
      const pages = join(root, folder.name, "pages");
      const files = await readdir(pages, { withFileTypes: true }).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const file of files) {
        if (signal.aborted) return { examined, added, rows };
        if (!file.isFile() || !/^(?:date-\d{4}-\d{2}-\d{2}|details-[a-f0-9]{64}|range-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2})\.json$/u.test(file.name)) continue;
        const page = JSON.parse(await readFile(join(pages, file.name), "utf8"));
        const saved = await source.savePage({ endpoint: "fixtures", rows: page.rows, parameters: page.listQuery, retrievedAt: Date.parse(page.retrievedAt) });
        examined++;
        added += saved.count;
        rows += page.rows.length;
      }
    }
    return { examined, added, rows };
  } finally { await database.disconnect(); }
}
