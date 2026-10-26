import "server-only";

import { z } from "zod";
import { matchDetailRules } from "../../domain/match-detail.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { MatchFeedError } from "./feed-error.ts";

const keys = ["revision", "cycle", "limit", "revisionAnchor", "revisionBefore", "cycleAnchor", "cycleBefore"] as const;
export function parseMatchDetailQuery(id: string, parameters: URLSearchParams) {
  try {
    z.uuid().parse(id);
    if (!(parameters instanceof URLSearchParams) || Buffer.byteLength(parameters.toString(), "utf8") > matchFeedRules.maximumQueryBytes ||
      [...parameters.keys()].some((key) => !keys.includes(key as typeof keys[number]) || parameters.getAll(key).length !== 1)) throw new Error();
    const optionalId = (key: "revision" | "cycle") => parameters.has(key) ? z.uuid().parse(parameters.get(key)) : null;
    const integer = (key: string, maximum: number, fallback: number | null = null, allowZero = false) => {
      if (!parameters.has(key)) return fallback;
      const value = parameters.get(key)!;
      if (!(allowZero && value === "0") && !/^[1-9]\d{0,9}$/u.test(value) || Number(value) > maximum) throw new Error();
      return Number(value);
    };
    const revision = optionalId("revision"), cycle = optionalId("cycle");
    const revisionAnchor = integer("revisionAnchor", matchDetailRules.maximumSequence, null, true), revisionBefore = integer("revisionBefore", matchDetailRules.maximumSequence);
    const cycleAnchor = integer("cycleAnchor", matchDetailRules.maximumSequence, null, true), cycleBefore = integer("cycleBefore", matchDetailRules.maximumSequence);
    if (revision && cycle || revisionBefore !== null && (revisionAnchor === null || revisionBefore > revisionAnchor) ||
      cycleBefore !== null && (cycleAnchor === null || cycleBefore > cycleAnchor)) throw new Error();
    return { revision, cycle, limit: integer("limit", matchDetailRules.maximumLimit, matchDetailRules.defaultLimit)!,
      revisionAnchor, revisionBefore, cycleAnchor, cycleBefore };
  } catch { throw new MatchFeedError("invalid-query"); }
}

export function detailHistoryLink(id: string, parameters: URLSearchParams, anchors: Readonly<{ revision: number | null; cycle: number | null }>,
  kind: "revision" | "cycle", before: number | null): string | null {
  if (before === null) return null;
  const query = new URLSearchParams(parameters);
  for (const key of ["revision", "cycle"] as const) if (anchors[key] !== null) query.set(`${key}Anchor`, String(anchors[key]));
  query.set(`${kind}Before`, String(before));
  return `/api/matches/${id}?${query}`;
}
