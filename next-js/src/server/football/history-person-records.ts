import "server-only";

export type FootballHistoryPersonRecordEndpoint = "trophies" | "sidelined";
export type FootballHistorySubjectKind = "player" | "coach";
export const historyPersonRecordBatchSize = 20;
export const footballHistoryPersonOmissionEndpoint = (endpoint: FootballHistoryPersonRecordEndpoint) => `${endpoint}Omitted` as const;

export function isFootballHistoryPersonRecordEndpoint(value: string): value is FootballHistoryPersonRecordEndpoint {
  return value === "trophies" || value === "sidelined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512 && !value.includes("\0");
}

export function isFootballHistoryPersonRecord(endpoint: FootballHistoryPersonRecordEndpoint,
  value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (endpoint === "trophies") return nonempty(value.league) &&
    [value.country, value.season, value.place].every((field) => field == null || nonempty(field));
  return nonempty(value.type) && [value.start, value.end].every((field) => field == null || nonempty(field));
}

export function readFootballHistoryPersonGroup(endpoint: FootballHistoryPersonRecordEndpoint, value: unknown,
  subjectIds: readonly number[]) {
  if (!isRecord(value) || typeof value.id !== "number" || !subjectIds.includes(value.id)) return null;
  const rows = value[endpoint];
  return Array.isArray(rows) && rows.every((row) => isFootballHistoryPersonRecord(endpoint, row))
    ? { subjectId: value.id, rows } : null;
}

export function footballHistoryPersonRecordSelector(kind: FootballHistorySubjectKind, subjectIds: readonly number[]) {
  if ((kind !== "player" && kind !== "coach") || !Array.isArray(subjectIds) || !subjectIds.length ||
      subjectIds.length > historyPersonRecordBatchSize || new Set(subjectIds).size !== subjectIds.length ||
      subjectIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 4_294_967_295)) return null;
  const key = subjectIds.length === 1 ? kind : kind === "player" ? "players" : "coachs";
  return { [key]: [...subjectIds].sort((left, right) => left - right).join("-") };
}

export function readFootballHistoryPersonSelector(parameters: Readonly<Record<string, string>>) {
  const entries = Object.entries(parameters);
  if (entries.length !== 1) return null;
  const [key, value] = entries[0]!;
  if (key !== "player" && key !== "players" && key !== "coach" && key !== "coachs") return null;
  const kind = key === "player" || key === "players" ? "player" : "coach";
  const subjectIds = value.split("-").map(Number);
  if (footballHistoryPersonRecordSelector(kind, subjectIds)?.[key] !== value) return null;
  return { kind, subjectIds };
}
