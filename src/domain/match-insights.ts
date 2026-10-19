import { z } from "zod";
import { isSafeRemoteImageUrl } from "./remote-image.ts";
import { matchSections } from "./match-view.ts";
import { contentAccessSchema } from "./content-access.ts";

/**
 * Match insights are read-only projections of stored data: verified regulation results from
 * the canonical catalog and permitted evidence from the prediction's evidence snapshot.
 * Nothing here is estimated or filled in; missing data stays empty with an explicit state.
 */
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u);
const at = z.number().int();
const text = (maximum: number) => z.string().max(maximum);
const logo = z.string().refine(isSafeRemoteImageUrl, "Unsafe image URL.").nullable();
const count = z.number().int().nonnegative().max(1_000_000);
const rate = z.number().min(0).max(1);

export const insightTeamSchema = z.strictObject({ id, name: text(512).nullable(), logoUrl: logo });
export const insightResultSchema = z.strictObject({
  fixtureId: id, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160), kickoffAt: at,
  competition: z.strictObject({ id, name: text(512).nullable(), logoUrl: logo }),
  home: insightTeamSchema, away: insightTeamSchema,
  /** Verified regulation score including stoppage time; extra time and penalties excluded. */
  homeGoals: count, awayGoals: count,
  status: z.enum(["finished-regulation", "finished-extra-time", "finished-penalties"]),
});
export type InsightResult = z.infer<typeof insightResultSchema>;
export const upcomingFixtureSchema = z.strictObject({ fixtureId: id, slug: insightResultSchema.shape.slug, kickoffAt: at,
  competition: insightResultSchema.shape.competition, home: insightTeamSchema, away: insightTeamSchema });

const teamSide = z.enum(["home", "away"]);
export const playerSchema = z.strictObject({ id: z.number().int().positive(), team: teamSide, name: text(256).nullable(),
  number: z.number().int().min(0).max(999).nullable(), position: text(32).nullable(), grid: text(16).nullable(),
  role: z.enum(["starting", "substitute"]).nullable() });
export const lineupSchema = z.strictObject({ team: teamSide, formation: text(32).nullable(), status: z.enum(["confirmed"]),
  updatedAt: at.nullable(), retrievedAt: at, starters: z.array(playerSchema).max(30), substitutes: z.array(playerSchema).max(40) });
export const injurySchema = z.strictObject({ team: teamSide, playerId: z.number().int().positive(), playerName: text(256).nullable(),
  status: z.enum(["out", "doubtful", "unknown"]), type: text(128).nullable(), reason: text(256).nullable(),
  updatedAt: at.nullable(), retrievedAt: at, source: text(128) });
export const newsItemSchema = z.strictObject({ id: text(128), kind: z.enum(["report", "analysis"]), publisher: text(512),
  title: text(2048), url: z.url().startsWith("https://").nullable(), publishedAt: at.nullable(), retrievedAt: at.nullable(),
  details: z.array(text(2048)).max(20) });
export const evidenceMetricSchema = z.strictObject({ metric: text(64), unit: text(16).nullable(),
  home: z.strictObject({ average: z.number(), samples: count }).nullable(), away: z.strictObject({ average: z.number(), samples: count }).nullable() });
export const teamSummarySchema = z.strictObject({ matches: count, wins: count, draws: count, losses: count, goalsFor: count, goalsAgainst: count,
  bttsRate: rate.nullable(), over25Rate: rate.nullable(), cleanSheetRate: rate.nullable(), failedToScoreRate: rate.nullable() });
export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const insightSectionsSchema = z.strictObject({
  form: z.strictObject({ home: z.array(insightResultSchema).max(40), away: z.array(insightResultSchema).max(40) }),
  h2h: z.strictObject({ meetings: z.array(insightResultSchema).max(60) }),
  stats: z.strictObject({ evidence: z.array(evidenceMetricSchema).max(40), evidenceRetrievedAt: at.nullable() }),
  lineups: z.strictObject({ home: lineupSchema.nullable(), away: lineupSchema.nullable() }),
  players: z.strictObject({ players: z.array(playerSchema).max(120) }),
  injuries: z.strictObject({ injuries: z.array(injurySchema).max(120) }),
  news: z.strictObject({ items: z.array(newsItemSchema).max(80), limitedNews: z.boolean() }),
  context: z.strictObject({
    competition: z.strictObject({ id, name: text(512).nullable(), country: text(256).nullable(), logoUrl: logo, round: text(512).nullable() }),
    kickoffAt: at.nullable(), restDays: z.strictObject({ home: z.number().nullable(), away: z.number().nullable() }),
    lastResults: z.strictObject({ home: insightResultSchema.nullable(), away: insightResultSchema.nullable() }),
    nextFixtures: z.strictObject({ home: upcomingFixtureSchema.nullable(), away: upcomingFixtureSchema.nullable() }),
  }),
  /** No referee, venue or weather source is stored yet; the states stay explicit. */
  referee: z.strictObject({ state: z.enum(["not-available"]) }),
  history: z.strictObject({ state: z.enum(["available"]) }),
});
export type InsightSections = z.infer<typeof insightSectionsSchema>;
export const storedMatchInsightsSchema = z.strictObject({ fixtureId: id, asOf: at,
  home: insightTeamSchema, away: insightTeamSchema, sections: insightSectionsSchema });
export const matchInsightsSchema = storedMatchInsightsSchema.extend({ access: contentAccessSchema });
export type StoredMatchInsights = z.infer<typeof storedMatchInsightsSchema>;
export type MatchInsights = z.infer<typeof matchInsightsSchema>;
export const insightSectionResponseSchema = z.strictObject({ fixtureId: id, asOf: at, section: z.enum(matchSections), data: z.unknown(), access: contentAccessSchema });
export const insightSectionSchemas = insightSectionsSchema.shape;

const totalsSchema = z.strictObject({ formHome: count, formAway: count, meetings: count, players: count, injuries: count, news: count, stats: count });
export const insightsPreviewSchema = z.strictObject({ fixtureId: id, asOf: at, home: insightTeamSchema, away: insightTeamSchema,
  sections: insightSectionsSchema, totals: totalsSchema });
export type InsightsPreview = z.infer<typeof insightsPreviewSchema>;

export {
  formRecords, headToHead, injuryStatus, insightsPreview,
  pageOf, perMatchValue, previewHoldsSection, previewRules, resultFor, summarize, teamComparison,
} from "./match-insight-presentation.ts";
