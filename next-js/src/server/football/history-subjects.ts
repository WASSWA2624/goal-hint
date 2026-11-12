import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";

const subjectSources = { playerProfiles: "player", playerStatistics: "player", squads: "player", coaches: "coach" } as const;
type SubjectSource = keyof typeof subjectSources;
type SubjectKind = typeof subjectSources[SubjectSource];
type SubjectDataset = "playerTeams" | "trophies" | "sidelined";
const pagesPerSource = 8;
const identitiesPerInsert = 2_000;

export type FootballHistorySubjectPage = Readonly<{
  id: string;
  endpoint: SubjectSource;
  selectorHash: string;
  parameters: unknown;
  contract: string;
  retrievedAt: Date;
  rowCount: number | bigint;
  contentHash: string;
  compressedRows: Uint8Array;
}>;

/** Index a bounded batch of verified pages. A page and its discovered identities advance together. */
export async function indexHistorySubjects(database: DatabaseRuntime,
  readIds: (page: FootballHistorySubjectPage) => Promise<readonly number[] | null>) {
  const endpoints = Object.keys(subjectSources) as SubjectSource[];
  const progress = { indexed: 0, invalid: 0, hasMore: false, hasInvalid: false };
  for (const endpoint of endpoints) {
    const pages = await database.query((client) => client.$queryRaw<FootballHistorySubjectPage[]>`
      SELECT id, endpoint, selectorHash, parameters, contract, retrievedAt, rowCount, contentHash, compressedRows
      FROM FootballHistorySourcePage
      WHERE endpoint = ${endpoint} AND subjectIndexStatus IS NULL
      ORDER BY id LIMIT ${pagesPerSource + 1}`);
    progress.hasMore ||= pages.length > pagesPerSource;
    const indexed: string[] = [], invalid: string[] = [], ids = new Set<number>();
    for (const page of pages.slice(0, pagesPerSource)) {
      const discovered = await readIds(page);
      (discovered ? indexed : invalid).push(page.id);
      for (const id of discovered ?? []) ids.add(id);
    }
    if (!indexed.length && !invalid.length) continue;
    await database.transaction(async (client) => {
      const orderedIds = [...ids].sort((left, right) => left - right);
      for (let offset = 0; offset < orderedIds.length; offset += identitiesPerInsert) {
        const rows = orderedIds.slice(offset, offset + identitiesPerInsert).map((id) => Prisma.sql`(${subjectSources[endpoint]}, ${id})`);
        await client.$executeRaw(Prisma.sql`
          INSERT INTO FootballHistorySubject (kind, externalId) VALUES ${Prisma.join(rows)}
          ON DUPLICATE KEY UPDATE externalId = FootballHistorySubject.externalId`);
      }
      if (indexed.length) await client.$executeRaw(Prisma.sql`UPDATE FootballHistorySourcePage
        SET subjectIndexStatus = 'indexed' WHERE subjectIndexStatus IS NULL AND id IN (${Prisma.join(indexed)})`);
      if (invalid.length) await client.$executeRaw(Prisma.sql`UPDATE FootballHistorySourcePage
        SET subjectIndexStatus = 'invalid' WHERE subjectIndexStatus IS NULL AND id IN (${Prisma.join(invalid)})`);
    });
    progress.indexed += indexed.length;
    progress.invalid += invalid.length;
  }
  const invalid = await database.query((client) => client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM FootballHistorySourcePage
    WHERE endpoint IN (${Prisma.join(endpoints)}) AND subjectIndexStatus = 'invalid' LIMIT 1`));
  progress.hasInvalid = invalid.length > 0;
  return progress;
}

/** Exact per-subject archive selectors are the durable receipts, including verified empty pages. */
export async function readPendingHistorySubjectIds(database: DatabaseRuntime, endpoint: SubjectDataset, kind: SubjectKind, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_001) throw new RangeError("Invalid historical subject batch limit.");
  const prefix = kind === "player" ? '{"player":"' : '{"coach":"';
  const rows = await database.query((client) => client.$queryRaw<{ externalId: number }[]>`
    SELECT subject.externalId FROM FootballHistorySubject AS subject
    WHERE subject.kind = ${kind} AND NOT EXISTS (
      SELECT 1 FROM FootballHistorySourcePage AS archived
      WHERE archived.endpoint = ${endpoint}
        AND archived.selectorHash = SHA2(CONCAT(${prefix}, subject.externalId, '"}'), 256)
    )
    ORDER BY subject.externalId LIMIT ${limit}`);
  return rows.map(({ externalId }) => Number(externalId));
}
