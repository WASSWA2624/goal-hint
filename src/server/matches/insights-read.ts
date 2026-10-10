import "server-only";

import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import { injuryStatus, matchInsightsSchema, type InsightResult, type MatchInsights } from "../../domain/match-insights.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import type { EvidenceSnapshot, EvidenceSource } from "../evidence/evidence-contract.ts";
import { isSafeEvidenceUrl } from "../evidence/evidence-network.ts";
import type { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedCycleDisplay } from "../predictions/history-read.ts";
import { publicRevisionAnalysis } from "./detail-read.ts";
import { MatchFeedError } from "./feed-error.ts";

const finished = ["finished-regulation", "finished-extra-time", "finished-penalties"] as const;
const bounds = Object.freeze({ formPerTeam: 40, meetings: 60 });
const text = (value: string | null | undefined) => value?.normalize("NFC").replace(/\p{Cc}/gu, " ").trim() || null;
const logo = (value: string | null | undefined) => isSafeRemoteImageUrl(value) ? value! : null;
const team = (row: { id: string; name: string | null; logoUrl: string | null }) => ({ id: row.id, name: text(row.name), logoUrl: logo(row.logoUrl) });

const fixtureInclude = { homeTeam: true, awayTeam: true, season: { include: { competition: true } } } as const;
type FixtureRow = Prisma.FootballFixtureGetPayload<{ include: typeof fixtureInclude }>;

/** Only verified regulation scores from the canonical catalog become results. */
function result(row: FixtureRow): InsightResult | null {
  if (row.kickoff === null || row.regulationHome === null || row.regulationAway === null || row.regulationVerifiedAt === null ||
    !(finished as readonly string[]).includes(row.status)) return null;
  const competition = row.season.competition;
  return { fixtureId: row.id, slug: canonicalMatchSlug(row.homeTeam.name, row.awayTeam.name), kickoffAt: row.kickoff.getTime(),
    competition: { id: competition.id, name: text(competition.name), logoUrl: logo(competition.logoUrl) },
    home: team(row.homeTeam), away: team(row.awayTeam), homeGoals: row.regulationHome, awayGoals: row.regulationAway,
    status: row.status as InsightResult["status"] };
}

/** Evidence is public only while its source allows summaries and remains within retention, as on the detail page. */
function permitted(snapshot: EvidenceSnapshot | null, asOf: number): readonly EvidenceSource[] {
  return snapshot ? snapshot.sources.filter((source) => source.reuse.allowSummary && source.reuse.retainUntil >= asOf) : [];
}

export async function storedMatchInsights(tx: Prisma.TransactionClient, fixtureId: string, asOf: number,
  evidenceStore: ReturnType<typeof createMysqlEvidenceStore>): Promise<MatchInsights> {
  const fixture = await tx.footballFixture.findUnique({ where: { id: fixtureId }, include: fixtureInclude });
  if (!fixture) throw new MatchFeedError("not-found");
  const homeId = fixture.homeTeamId, awayId = fixture.awayTeamId;
  const before = fixture.kickoff ?? new Date(asOf);
  const played: Prisma.FootballFixtureWhereInput = { status: { in: [...finished] }, regulationVerifiedAt: { not: null }, kickoff: { lt: before }, id: { not: fixtureId } };
  const recent = async (teamId: string) => (await tx.footballFixture.findMany({ where: { ...played, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    include: fixtureInclude, orderBy: [{ kickoff: "desc" }, { id: "asc" }], take: bounds.formPerTeam })).map(result).filter((row): row is InsightResult => row !== null);
  const [homeForm, awayForm] = [await recent(homeId), await recent(awayId)];
  const meetings = (await tx.footballFixture.findMany({ where: { ...played,
    OR: [{ homeTeamId: homeId, awayTeamId: awayId }, { homeTeamId: awayId, awayTeamId: homeId }] },
    include: fixtureInclude, orderBy: [{ kickoff: "desc" }, { id: "asc" }], take: bounds.meetings })).map(result).filter((row): row is InsightResult => row !== null);
  const next = async (teamId: string) => {
    if (fixture.kickoff === null) return null;
    const row = await tx.footballFixture.findFirst({ where: { status: "scheduled", kickoff: { gt: fixture.kickoff }, id: { not: fixtureId },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] }, include: fixtureInclude, orderBy: [{ kickoff: "asc" }, { id: "asc" }] });
    if (!row || row.kickoff === null) return null;
    const competition = row.season.competition;
    return { fixtureId: row.id, slug: canonicalMatchSlug(row.homeTeam.name, row.awayTeam.name), kickoffAt: row.kickoff.getTime(),
      competition: { id: competition.id, name: text(competition.name), logoUrl: logo(competition.logoUrl) }, home: team(row.homeTeam), away: team(row.awayTeam) };
  };
  // Rest days are derived from the last stored verified result before kickoff; actual recovery time is unknown.
  const rest = (form: readonly InsightResult[]) => fixture.kickoff && form[0] ? Math.round((fixture.kickoff.getTime() - form[0].kickoffAt) / 3_600_000) / 24 : null;

  // The prediction's own evidence snapshot supplies lineups, injuries, statistics and news.
  const display = fixture.activeCycleId ? await storedCycleDisplay(tx, fixture.activeCycleId) : null;
  const revision = display?.revision ?? null;
  let evidence: EvidenceSnapshot | null = null;
  if (revision) {
    const stored = await evidenceStore.findInTransaction(tx, revision.evidenceSnapshotId);
    if (stored && stored.snapshot.hash === revision.evidenceHash && stored.snapshot.context.fixtureId === fixtureId) evidence = stored.snapshot;
  } else {
    const latest = await tx.fixtureEvidenceSnapshot.findFirst({ where: { fixtureId }, orderBy: { analysisAt: "desc" }, select: { requestId: true } });
    const stored = latest ? await evidenceStore.findInTransaction(tx, latest.requestId) : null;
    if (stored && stored.snapshot.context.fixtureId === fixtureId) evidence = stored.snapshot;
  }
  const sources = permitted(evidence, asOf);
  const sideOf = (teamId: string | null) => teamId === homeId ? "home" as const : teamId === awayId ? "away" as const : null;
  const string = (value: unknown) => typeof value === "string" ? value.slice(0, 256) : null;
  const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : null;

  const lineups: MatchInsights["sections"]["lineups"] = { home: null, away: null };
  const players = new Map<string, MatchInsights["sections"]["players"]["players"][number]>();
  const injuries: MatchInsights["sections"]["injuries"]["injuries"] = [];
  const metrics = new Map<string, { unit: string | null; home: number[]; away: number[] }>();
  let statisticsAt: number | null = null;
  for (const source of sources) {
    for (const claim of source.claims) {
      const side = sideOf(claim.subjectTeamId);
      if (!side) continue;
      const value = claim.value;
      if (claim.kind === "lineup") {
        const playerId = integer(value.playerExternalId);
        if (!playerId) continue;
        const role: "starting" | "substitute" | null = value.role === "starting" || value.role === "substitute" ? value.role : null;
        const player = { id: playerId, team: side, name: string(value.playerName), number: integer(value.number), position: string(value.position)?.slice(0, 32) ?? null,
          grid: string(value.grid)?.slice(0, 16) ?? null, role };
        players.set(`${side}:${playerId}`, player);
        const lineup = lineups[side] ?? { team: side, formation: string(value.formation)?.slice(0, 32) ?? null, status: "confirmed" as const,
          updatedAt: claim.asOfAt, retrievedAt: source.retrievedAt, starters: [], substitutes: [] };
        if (role === "starting" && lineup.starters.length < 30) lineup.starters.push(player);
        if (role === "substitute" && lineup.substitutes.length < 40) lineup.substitutes.push(player);
        lineups[side] = lineup;
      } else if (claim.kind === "injury") {
        const playerId = integer(value.playerExternalId);
        if (!playerId || injuries.length >= 120) continue;
        const type = string(value.type)?.slice(0, 128) ?? null;
        injuries.push({ team: side, playerId, playerName: string(value.playerName), status: injuryStatus(type), type,
          reason: string(value.reason), updatedAt: claim.asOfAt, retrievedAt: source.retrievedAt, source: source.publisher.slice(0, 128) });
        if (!players.has(`${side}:${playerId}`)) players.set(`${side}:${playerId}`, { id: playerId, team: side, name: string(value.playerName),
          number: null, position: null, grid: null, role: null });
      } else if (claim.kind === "statistic") {
        const metric = string(value.metric), amount = typeof value.value === "number" && Number.isFinite(value.value) ? value.value : null;
        if (!metric || amount === null) continue;
        const entry = metrics.get(metric) ?? { unit: string(value.unit)?.slice(0, 16) ?? null, home: [], away: [] };
        entry[side].push(amount); metrics.set(metric, entry);
        statisticsAt = Math.max(statisticsAt ?? 0, source.retrievedAt);
      }
    }
  }
  const average = (values: number[]) => values.length ? { average: values.reduce((a, b) => a + b, 0) / values.length, samples: values.length } : null;
  const news: MatchInsights["sections"]["news"]["items"] = sources.filter((source) => source.kind === "news").slice(0, 60).map((source) => ({
    id: source.id.slice(0, 128), kind: "report" as const, publisher: source.publisher.slice(0, 512), title: source.title.slice(0, 2048),
    url: isSafeEvidenceUrl(source.sourceUrl) ? source.sourceUrl : null, publishedAt: source.publishedAt, retrievedAt: source.retrievedAt,
    details: source.claims.map((claim) => claim.summary.slice(0, 2048)).slice(0, 20) }));
  // Generated analysis is labelled separately from sourced reporting.
  if (revision && evidence) {
    const analysis = publicRevisionAnalysis(revision, evidence, asOf);
    if (analysis.state === "available") {
      analysis.reasons.forEach((reason, index) => news.push({ id: `analysis-${index + 1}`, kind: "analysis", publisher: "Goal Hint analysis",
        title: reason.text.slice(0, 2048), url: null, publishedAt: revision.publishedAt, retrievedAt: null, details: [] }));
      if (analysis.uncertainty) news.push({ id: "analysis-uncertainty", kind: "analysis", publisher: "Goal Hint analysis",
        title: analysis.uncertainty.text.slice(0, 2048), url: null, publishedAt: revision.publishedAt, retrievedAt: null, details: [] });
    }
  }
  const competition = fixture.season.competition;
  return matchInsightsSchema.parse({ fixtureId, asOf, home: team(fixture.homeTeam), away: team(fixture.awayTeam), sections: {
    form: { home: homeForm, away: awayForm },
    h2h: { meetings },
    stats: { evidence: [...metrics].sort(([a], [b]) => a.localeCompare(b)).slice(0, 40).map(([metric, entry]) => ({ metric: metric.slice(0, 64), unit: entry.unit,
      home: average(entry.home), away: average(entry.away) })), evidenceRetrievedAt: statisticsAt },
    lineups,
    players: { players: [...players.values()].slice(0, 120) },
    injuries: { injuries },
    news: { items: news.slice(0, 80), limitedNews: evidence?.coverage.limitedNews ?? false },
    context: { competition: { id: competition.id, name: text(competition.name), country: text(competition.country), logoUrl: logo(competition.logoUrl),
      round: text(fixture.round) }, kickoffAt: fixture.kickoff?.getTime() ?? null, restDays: { home: rest(homeForm), away: rest(awayForm) },
      lastResults: { home: homeForm[0] ?? null, away: awayForm[0] ?? null }, nextFixtures: { home: await next(homeId), away: await next(awayId) } },
    referee: { state: "not-available" },
    history: { state: "available" },
  } });
}
