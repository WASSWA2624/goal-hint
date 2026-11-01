import { z } from "zod";
import { isSafeRemoteImageUrl } from "./remote-image.ts";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u);
const text = z.string().max(512), count = z.number().int().min(0).max(1_000_000);
const signed = z.number().int().min(-1_000_000).max(1_000_000);
const instant = z.number().int();
export const competitionTeamSchema = z.strictObject({ id, name: text.nullable(),
  shortName: z.string().max(64).nullable().optional(),
  logoUrl: z.string().refine(isSafeRemoteImageUrl).nullable() });
export const standingFormSchema = z.strictObject({ result: z.enum(["W", "D", "L"]),
  opponent: text.nullable().optional(), kickoffAt: instant.nullable().optional(),
  goalsFor: count.nullable().optional(), goalsAgainst: count.nullable().optional() });
export const standingRowSchema = z.strictObject({ team: competitionTeamSchema, rank: count.min(1).nullable(),
  played: count.nullable(), wins: count.nullable(), draws: count.nullable(), losses: count.nullable(),
  goalsFor: count.nullable(), goalsAgainst: count.nullable(), goalDifference: signed.nullable(), points: signed.nullable(),
  form: z.array(standingFormSchema).max(5), note: text.nullable().optional() });
export const competitionTablesSchema = z.strictObject({ retrievedAt: instant.nullable(), complete: z.boolean(),
  groups: z.array(z.strictObject({ id, name: text.nullable(), rows: z.array(standingRowSchema).max(128) })).max(32) })
  .superRefine((table,ctx) => {
    if (new Set(table.groups.map(group => group.id)).size !== table.groups.length
      || table.groups.some(group => new Set(group.rows.map(row => row.team.id)).size !== group.rows.length))
      ctx.addIssue({code:"custom",message:"Duplicate standing group or team."});
  });
export const knockoutFixtureSchema = z.strictObject({ fixtureId: id.nullable(), slug: z.string().max(160).nullable(),
  kickoffAt: instant.nullable(), homeId: id, awayId: id, status: z.string().max(32),
  homeGoals: count.nullable(), awayGoals: count.nullable(), penaltyHome: count.nullable(), penaltyAway: count.nullable(),
  scorePeriod: z.enum(["final", "regulation", "live"]).nullable() });
export const knockoutTieSchema = z.strictObject({ id, home: competitionTeamSchema.nullable(), away: competitionTeamSchema.nullable(),
  fixtures: z.array(knockoutFixtureSchema).max(4), aggregateHome: count.nullable(), aggregateAway: count.nullable(),
  winnerId: id.nullable(), nextTieId: id.nullable() });
export const knockoutBracketSchema = z.strictObject({ complete: z.boolean(), retrievedAt: instant.nullable(),
  rounds: z.array(z.strictObject({ id, name: text, ties: z.array(knockoutTieSchema).max(64) })).max(12) })
  .superRefine((bracket, ctx) => {
    const nodes = new Map<string, number>();
    if (new Set(bracket.rounds.map(round => round.id)).size !== bracket.rounds.length)
      ctx.addIssue({code:"custom",message:"Duplicate knockout round."});
    bracket.rounds.forEach((round, stage) => round.ties.forEach(tie => {
      if (nodes.has(tie.id)) ctx.addIssue({ code: "custom", message: "Duplicate knockout tie." });
      nodes.set(tie.id, stage);
      if (tie.home && tie.home.id === tie.away?.id) ctx.addIssue({ code: "custom", message: "A team cannot face itself." });
      if (tie.winnerId && tie.winnerId !== tie.home?.id && tie.winnerId !== tie.away?.id)
        ctx.addIssue({ code: "custom", message: "Winner is not a tie participant." });
      if (tie.fixtures.some(match => match.homeId === match.awayId || (tie.home && tie.away
        && (![tie.home.id,tie.away.id].includes(match.homeId) || ![tie.home.id,tie.away.id].includes(match.awayId)))))
        ctx.addIssue({code:"custom",message:"Fixture participants do not match the tie."});
    }));
    bracket.rounds.forEach((round, stage) => round.ties.forEach(tie => {
      if (tie.nextTieId && (!nodes.has(tie.nextTieId) || nodes.get(tie.nextTieId)! <= stage))
        ctx.addIssue({ code: "custom", message: "Progression must lead to a supplied later round." });
    }));
  });
export const competitionViewSchema = z.strictObject({ season: z.number().int().min(1800).max(3000).nullable(),
  defaultView: z.enum(["table", "bracket"]), tables: competitionTablesSchema.nullable(), bracket: knockoutBracketSchema.nullable() });
export type CompetitionView = z.infer<typeof competitionViewSchema>;
export type CompetitionTeam = z.infer<typeof competitionTeamSchema>;
export type StandingRow = z.infer<typeof standingRowSchema>;
export type KnockoutTie = z.infer<typeof knockoutTieSchema>;
export type KnockoutBracket = z.infer<typeof knockoutBracketSchema>;

/** Recognise explicit knockout stage names, never league matchday numbers. */
export function knockoutStage(round: string | null): { id: string; name: string; order: number } | null {
  if (!round) return null;
  const value = round.toLowerCase().replace(/[–—_-]/gu, " ").replace(/\s+/gu, " ").trim();
  if (/\b(third|3rd)\b/u.test(value)) return { id:"third-place",name:"Third-place play-off",order:9 };
  if (/\bsemi\s*finals?\b/u.test(value)) return { id: "semi-finals", name: "Semi-finals", order: 7 };
  if (/\bquarter\s*finals?\b/u.test(value)) return { id: "quarter-finals", name: "Quarter-finals", order: 6 };
  const size = /\b(?:round of|last)\s+(128|64|32|16|8|4|2)\b/u.exec(value)?.[1];
  if (size) return { id: `round-of-${size}`, name: `Round of ${size}`, order: 9 - Math.log2(Number(size)) };
  if (/^finals?(?:\s+(?:(?:1st|2nd|first|second)\s+leg|leg\s+[12]))?$/u.test(value)) return { id: "final", name: "Final", order: 8 };
  if (/\bplay\s*offs?\b/u.test(value)) return { id: "play-offs", name: "Play-offs", order: 1 };
  return null;
}

export type KnockoutSourceFixture = { id: string; slug: string; round: string | null; kickoffAt: number | null;
  home: CompetitionTeam; away: CompetitionTeam; status: string; homeGoals: number | null; awayGoals: number | null;
  penaltyHome: number | null; penaltyAway: number | null; scorePeriod: "final" | "regulation" | "live" | null };
const finalStatus = new Set(["finished-regulation", "finished-extra-time", "finished-penalties", "awarded"]);

/** Catalog subsets cannot prove a full draw. Link only unique, observed progression. */
export function bracketFromFixtures(fixtures: readonly KnockoutSourceFixture[], retrievedAt: number | null): KnockoutBracket | null {
  const stages = new Map<string, { order: number; name: string; ties: Map<string, KnockoutTie> }>();
  for (const fixture of fixtures) {
    const stage = knockoutStage(fixture.round);
    if (!stage) continue;
    const group = stages.get(stage.id) ?? { order: stage.order, name: stage.name, ties: new Map<string, KnockoutTie>() };
    stages.set(stage.id, group);
    const pair = [fixture.home.id, fixture.away.id].sort().join("|");
    const tie = group.ties.get(pair) ?? { id: fixture.id, home: fixture.home, away: fixture.away,
      fixtures: [], aggregateHome: null, aggregateAway: null, winnerId: null, nextTieId: null };
    if (tie.fixtures.length >= 4 || tie.fixtures.some(match => match.fixtureId === fixture.id)) continue;
    tie.fixtures.push({ fixtureId: fixture.id, slug: fixture.slug, kickoffAt: fixture.kickoffAt,
      homeId: fixture.home.id, awayId: fixture.away.id, status: fixture.status, homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals,
      penaltyHome: fixture.penaltyHome, penaltyAway: fixture.penaltyAway, scorePeriod: fixture.scorePeriod });
    group.ties.set(pair, tie);
  }
  const rounds = [...stages.entries()].sort((a,b) => a[1].order - b[1].order).map(([id, group]) => ({ id, name: group.name,
    ties: [...group.ties.values()].sort((a,b) => (a.fixtures[0]?.kickoffAt ?? Infinity) - (b.fixtures[0]?.kickoffAt ?? Infinity)
      || a.id.localeCompare(b.id)).slice(0,64) }));
  // A single sealed final can identify a winner even when no later round exists.
  // Replays and multiple legs still require supplied aggregate/progression data.
  for (const round of rounds) for (const tie of round.ties) {
    const match = tie.fixtures.length === 1 ? tie.fixtures[0] : null;
    if (!match || match.scorePeriod !== "final" || !finalStatus.has(match.status)
      || match.homeGoals === null || match.awayGoals === null) continue;
    const home = match.homeGoals !== match.awayGoals ? match.homeGoals : match.penaltyHome;
    const away = match.homeGoals !== match.awayGoals ? match.awayGoals : match.penaltyAway;
    if (home !== null && away !== null && home !== away) tie.winnerId = home > away ? match.homeId : match.awayId;
  }
  for (let index = 0; index < rounds.length - 1; index++) {
    if (rounds[index]!.id === "third-place" || rounds[index+1]!.id === "third-place") continue;
    for (const tie of rounds[index]!.ties) {
      if (!tie.fixtures.length || !tie.fixtures.every(match => finalStatus.has(match.status) && match.kickoffAt !== null)) continue;
      const last = Math.max(...tie.fixtures.map(match => match.kickoffAt!));
      const candidates = rounds[index + 1]!.ties.flatMap(next => {
        if (!next.fixtures.some(match => match.kickoffAt !== null && match.kickoffAt > last)) return [];
        const shared = [tie.home?.id, tie.away?.id].filter(id => id && (id === next.home?.id || id === next.away?.id));
        return shared.length === 1 ? [{ next, team: shared[0]! }] : [];
      });
      if (candidates.length === 1 && (!tie.winnerId || tie.winnerId === candidates[0]!.team)) {
        tie.nextTieId = candidates[0]!.next.id; tie.winnerId = candidates[0]!.team;
      }
    }
  }
  return rounds.length ? knockoutBracketSchema.parse({ rounds, complete: false, retrievedAt }) : null;
}

export const bracketGeometry = Object.freeze({ cardWidth: 224, cardHeight: 100, columnGap: 36, rowGap: 24, padding: 16 });
/** Lay out observed edges, including byes and incomplete trees, without inventing pairings. */
export function layoutBracket(bracket: KnockoutBracket) {
  const { cardWidth, cardHeight, columnGap, rowGap, padding } = bracketGeometry;
  const nodes = bracket.rounds.flatMap((round, column) => round.ties.map(tie => ({ tie, column })));
  const byId = new Map(nodes.map(node => [node.tie.id, node]));
  const parents = new Map<string, string[]>();
  for (const node of nodes) if (node.tie.nextTieId) parents.set(node.tie.nextTieId, [...parents.get(node.tie.nextTieId) ?? [], node.tie.id]);
  const positions = new Map<string, { x: number; y: number; column: number }>();
  let cursor = 0;
  function place(id: string): number {
    const existing = positions.get(id); if (existing) return existing.y;
    const node = byId.get(id)!;
    const incoming = parents.get(id) ?? [];
    let y: number;
    if (incoming.length) { const values = incoming.map(place); y = values.reduce((sum,value) => sum + value, 0) / values.length; }
    else { y = padding + cursor * (cardHeight + rowGap); cursor++; }
    positions.set(id, { x: padding + node.column * (cardWidth + columnGap), y, column: node.column });
    return y;
  }
  for (const node of [...nodes].sort((a,b) => b.column - a.column)) place(node.tie.id);
  // Disconnected ties in one round still need separate readable hit targets.
  for (const round of bracket.rounds) {
    const ordered = round.ties.map(tie => positions.get(tie.id)!).sort((a,b) => a.y - b.y);
    for (let i = 1; i < ordered.length; i++) ordered[i]!.y = Math.max(ordered[i]!.y, ordered[i-1]!.y + cardHeight + rowGap);
  }
  return { positions, width: padding * 2 + bracket.rounds.length * (cardWidth + columnGap) - columnGap,
    height: Math.max(cardHeight + padding * 2, ...[...positions.values()].map(point => point.y + cardHeight + padding)) };
}

export function tieScore(tie: KnockoutTie) {
  if (tie.aggregateHome !== null || tie.aggregateAway !== null) return { home: tie.aggregateHome, away: tie.aggregateAway, aggregate: true };
  const match = tie.fixtures.length === 1 ? tie.fixtures[0] : null;
  if (!match || !tie.home || !tie.away) return {home:null,away:null,aggregate:false};
  return { home: match.homeId === tie.home.id ? match.homeGoals : match.awayGoals,
    away: match.awayId === tie.away.id ? match.awayGoals : match.homeGoals, aggregate: false };
}
