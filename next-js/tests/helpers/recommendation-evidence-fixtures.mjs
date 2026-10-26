import { evidenceHash, evidenceSource } from './evidence-fixtures.mjs';

/** Point-in-time synthetic form: the home team wins and the away team loses three verified regulation matches. */
export function recommendationFootballSources(context) {
  const DAY = 86400000, sources = [evidenceSource(context)];
  for (const [side, team] of [['home', context.home], ['away', context.away]]) {
    for (let index = 0; index < 3; index++) {
      const fixtureId = 20000 + team.externalId * 10 + index, kickoffAt = context.cutoffAt - (index + 1) * DAY;
      sources.push(evidenceSource(context, { sourceKey: evidenceHash(`${team.teamId}:${fixtureId}`), claims: [{
        kind: 'history', subjectTeamId: team.teamId, key: `fixture-${fixtureId}`,
        value: { fixtureId, homeExternalId: side === 'home' ? team.externalId : 99,
          awayExternalId: side === 'home' ? 99 : team.externalId, kickoffAt, homeGoals: 2, awayGoals: 0,
          regulationVerified: true, period: 'regulation-including-stoppage-time' },
        summary: 'Synthetic verified regulation match.', certainty: 'confirmed', asOfAt: kickoffAt + 7200000 }] }));
    }
    sources.push(evidenceSource(context, { sourceKey: evidenceHash(`${team.teamId}:form-rest`), claims: [
      { kind: 'form', subjectTeamId: team.teamId, key: 'regulation-form', certainty: 'confirmed', asOfAt: context.cutoffAt - DAY,
        summary: 'Synthetic three-match regulation form.', value: { matches: 3, wins: side === 'home' ? 3 : 0, draws: 0,
          losses: side === 'home' ? 0 : 3, goalsFor: side === 'home' ? 6 : 0, goalsAgainst: side === 'home' ? 0 : 6,
          points: side === 'home' ? 9 : 0, windowStartsAt: context.cutoffAt - 3 * DAY, windowEndsAt: context.cutoffAt - DAY,
          period: 'regulation-including-stoppage-time' } },
      { kind: 'rest', subjectTeamId: team.teamId, key: 'kickoff-gap', certainty: 'confirmed', asOfAt: context.cutoffAt - DAY,
        summary: 'Synthetic preceding fixture kickoff.', value: { lastKickoffAt: context.cutoffAt - DAY,
          restDays: (context.kickoffAt - context.cutoffAt + DAY) / DAY } },
    ] }));
  }
  return sources;
}
