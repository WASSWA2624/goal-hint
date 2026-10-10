import "server-only";

import { Fragment } from "react";
import { Button, TextInput, SelectInput, TextLink } from "@/components/ui/controls";
import { DataTable, DataTableRegion, DefinitionList } from "@/components/ui/data-display";
import { Disclosure } from "@/components/ui/disclosure";
import { BodyText, Inline, MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { parseReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { performanceFamilies, type PerformanceCell, type PerformanceResponse } from "@/domain/performance";
import { createContentMessages, type ContentTextKey } from "@/i18n/content-messages";
import { performanceParameters, type PerformancePageResult } from "@/server/performance/performance-page";
import { LineGroup } from "./information-styles";

const reasonKeys: Record<string, ContentTextKey> = {
  "unapproved-policy": "performance.reason.policy", "no-settled-samples": "performance.reason.samples",
  "insufficient-settled-samples": "performance.reason.samples", "outside-approved-policy-scope": "performance.reason.scope",
  "mixed-or-unknown-horizons-use-horizon-cells": "performance.reason.horizon",
  "missing-public-sample-and-quality-gate": "performance.reason.gate",
  "insufficient-matched-baseline-samples": "performance.reason.baseline",
};
function ReportTime({ at, locale }: { at: number | null; locale: string }) {
  const messages = createContentMessages(locale);
  return at === null ? messages.text("performance.none") : <time dateTime={toUtcIsoString(utcInstantFromEpochMilliseconds(at))}>
    {messages.reportingInstant(utcInstantFromEpochMilliseconds(at))}</time>;
}

function PerformanceCell({ cell, locale }: { cell: PerformanceCell; locale: string }) {
  const messages = createContentMessages(locale), { coverage, metrics } = cell;
  const number = (value: number) => messages.number(value, { maximumFractionDigits: 4 });
  const percent = (value: number) => messages.number(value, { style: "percent", maximumFractionDigits: 2 });
  const missing = messages.text("performance.noSamples");
  return <Surface data-performance-cell={`${cell.family}:${cell.source}:${cell.horizon?.id ?? "overall"}`}>
    <Stack $gap="md">
      <h4>{messages.text(`performance.source.${cell.source}`)}</h4>
      <DefinitionList data-performance-coverage>
        {(["total", "available", "settled", "pending", "unavailable", "void", "filteredOut"] as const).map((key) => <Fragment key={key}>
          <dt>{messages.text(`performance.coverage.${key}`)}</dt><dd data-count={key}>{messages.number(coverage[key])}</dd>
        </Fragment>)}
      </DefinitionList>
      <MutedText>{messages.text("performance.coverage.sources", { ai: messages.number(coverage.sources.ai), fallback: messages.number(coverage.sources["api-football"]) })}</MutedText>
      <BodyText><strong>{messages.text(`performance.metrics.${metrics.state}`)}</strong></BodyText>
      <BodyText data-performance-denominator>{messages.text("performance.denominator", { count: messages.number(metrics.denominator),
        correct: messages.number(metrics.correct), incorrect: messages.number(metrics.incorrect) })}</BodyText>
      <BodyText>{metrics.minimumSamples === null ? messages.text("performance.noMinimum") :
        messages.text("performance.minimum", { count: messages.number(metrics.minimumSamples) })}</BodyText>
      {metrics.state !== "available" ? <>
        <BodyText>{messages.text("performance.withheld")}</BodyText>
        {[...new Set(metrics.reasons.map((reason) => reasonKeys[reason] ?? "performance.reason.quality"))].map((key) => <MutedText key={key}>{messages.text(key)}</MutedText>)}
      </> : <>
        <DefinitionList data-performance-metrics>
          <dt>{messages.text("performance.hitRate")}</dt><dd>{messages.text("performance.hitRateValue", {
            rate: percent(metrics.hitRate!), correct: messages.number(metrics.correct), count: messages.number(metrics.denominator) })}</dd>
          <dt>{messages.text("performance.brier")}</dt><dd>{number(metrics.brier!)}</dd>
          <dt>{messages.text("performance.logLoss")}</dt><dd>{number(metrics.logLoss!)}</dd>
          <dt>{messages.text("performance.calibrationError")}</dt><dd>{percent(metrics.calibrationError!)}</dd>
        </DefinitionList>
        <Disclosure $plain><summary>{messages.text("performance.calibration")}</summary>
          <Stack $gap="sm">
            <BodyText>{messages.text("performance.calibrationHint", { z: number(metrics.confidenceZ!) })}</BodyText>
            <DataTableRegion tabIndex={0} role="region" aria-label={`${messages.text(`market.family.${cell.family}`)} · ${messages.text(`performance.source.${cell.source}`)} · ${messages.text("performance.calibration")}`}>
              <DataTable>
                <caption>{messages.text("performance.calibration")}</caption>
                <thead><tr>{(["selection", "band", "eventCount", "mean", "frequency", "interval"] as const).map((key) =>
                  <th scope="col" key={key}>{messages.text(`performance.${key}`)}</th>)}</tr></thead>
                <tbody>{metrics.calibration.map((band) => <tr key={`${band.selection}:${band.lower}`}>
                  <th scope="row">{messages.text(`market.selection.${band.selection}` as ContentTextKey)}</th>
                  <td>{percent(band.lower)} – {percent(band.upper)}</td><td>{messages.number(band.count)}</td>
                  <td>{band.meanProbability === null ? missing : percent(band.meanProbability)}</td>
                  <td>{band.observedFrequency === null ? missing : percent(band.observedFrequency)}</td>
                  <td>{band.interval ? `${percent(band.interval.lower)} – ${percent(band.interval.upper)}` : missing}</td>
                </tr>)}</tbody>
              </DataTable>
            </DataTableRegion>
          </Stack>
        </Disclosure>
      </>}
      <Disclosure $plain><summary>{messages.text("performance.versions")}</summary>
        <Stack $gap="sm">{cell.versions.length === 0 ? <BodyText>{messages.text("performance.noVersions")}</BodyText> :
          cell.versions.map((version) => <Stack key={`${version.source}:${version.modelVersionId}:${version.version}`} $gap="sm">
            <BodyText>{messages.text("performance.versionLabel", { source: messages.text(`performance.source.${version.source}`), provider: version.provider,
              model: version.model ?? messages.text("performance.notApplicable"), version: version.version,
              calibration: version.calibrationVersion ?? messages.text("performance.notApplicable") })}</BodyText>
            {version.modelVersionId && <BodyText>{messages.text("performance.modelId")}: {version.modelVersionId}</BodyText>}
          </Stack>)}</Stack>
      </Disclosure>
      {cell.evidence.total > 0 && <Disclosure $plain><summary>{messages.text("performance.evidence")}</summary><Stack $gap="md">
        <BodyText>{messages.text("performance.evidenceHint", { shown: messages.number(cell.evidence.links.length), total: messages.number(cell.evidence.total) })}</BodyText>
        {cell.evidence.links.map((link) => <Stack key={link.revisionId} $gap="sm">
          <TextLink href={link.pageHref} prefetch={false}>{link.matchLabel} · {messages.text(`performance.source.${link.source}`)}</TextLink>
          <MutedText>{messages.text("performance.evidenceClocks", {
            publication: messages.reportingInstant(utcInstantFromEpochMilliseconds(link.forecastAt)),
            evidence: messages.reportingInstant(utcInstantFromEpochMilliseconds(link.evidenceCutoffAt)) })}</MutedText>
        </Stack>)}
      </Stack></Disclosure>}
    </Stack>
  </Surface>;
}

function StoredReport({ data, locale }: { data: PerformanceResponse; locale: string }) {
  const messages = createContentMessages(locale);
  const horizons = [...new Map(data.cells.map((cell) => [cell.horizon?.id ?? "overall", cell.horizon])).values()];
  const overall = data.cells.filter((cell) => cell.horizon === null);
  const operationCounts = { historicalVoid: data.historicalCycles.void, historicalPostponed: data.historicalCycles.postponed,
    jobs: data.operations.total, failed: data.operations.failed, failedFixtures: data.operations.failedFixtures,
    pendingJobs: data.operations.pending, delayed: data.operations.delayedRefreshes, delayedFixtures: data.operations.delayedFixtures };
  return <Stack $gap="lg" data-stored-performance>
    {/* One-line report facts read as a single block below desktop; families and operations keep the outer gap. */}
    <LineGroup>
      <BodyText>{messages.text("performance.period", { from: messages.reportingDate(parseReportingDate(data.cohort.from)), to: messages.reportingDate(parseReportingDate(data.cohort.to)) })}</BodyText>
      <BodyText>{messages.text("performance.filtersApplied", { source: messages.text(`performance.source.${data.filters.source}`),
        model: data.filters.model ?? messages.text("performance.any"), version: data.filters.version ?? messages.text("performance.any") })}</BodyText>
      <BodyText>{messages.text("performance.cohort", { count: messages.number(data.cohort.fixtureCount) })}</BodyText>
      <BodyText>{messages.text(data.policy.state === "unapproved" ? "performance.unapproved" : "performance.verified")}</BodyText>
      {data.cohort.fixtureCount === 0 && <BodyText>{messages.text("performance.empty")}</BodyText>}
      <MutedText>{messages.text("performance.asOf")}: <ReportTime at={data.asOf} locale={locale} /></MutedText>
      <MutedText>{messages.text("performance.lastSettled")}: <ReportTime at={data.freshness.lastSettledAt} locale={locale} /></MutedText>
      <MutedText>{messages.text("performance.lastCorrected")}: <ReportTime at={data.freshness.lastCorrectedAt} locale={locale} /></MutedText>
      <BodyText>{messages.text("performance.accounting")}</BodyText>
      <BodyText>{messages.text("performance.scoreContext")}</BodyText>
      <BodyText>{messages.text("performance.comparison")}</BodyText>
    </LineGroup>
    {performanceFamilies.filter((family) => overall.some((cell) => cell.family === family)).map((family) => <Stack as="section" key={family} aria-labelledby={`performance-${family}`} $gap="md">
      <h3 id={`performance-${family}`}>{messages.text(`market.family.${family}`)}</h3>
      {family === "double-chance" && <BodyText>{messages.text("performance.doubleChance")}</BodyText>}
      <BodyText>{messages.text("performance.overall")}</BodyText>
      {overall.filter((cell) => cell.family === family).map((cell) => <PerformanceCell key={cell.source} cell={cell} locale={locale} />)}
      {horizons.filter((horizon) => horizon !== null).map((horizon) => <Disclosure key={horizon.id}>
        <summary>{messages.text("performance.horizon", { id: horizon.id, minimum: messages.number(horizon.minimumMs / 3_600_000), maximum: messages.number(horizon.maximumMs / 3_600_000) })}</summary>
        <Stack $gap="md"><BodyText>{messages.text("performance.horizonHint")}</BodyText>
          {data.cells.filter((cell) => cell.family === family && cell.horizon?.id === horizon.id).map((cell) => <PerformanceCell key={cell.source} cell={cell} locale={locale} />)}
        </Stack>
      </Disclosure>)}
    </Stack>)}
    <Disclosure><summary>{messages.text("performance.operations")}</summary><Stack $gap="md">
      <BodyText>{messages.text("performance.operationsHint")}</BodyText>
      <DefinitionList>{Object.entries(operationCounts).map(([key, value]) => <Fragment key={key}>
        <dt>{messages.text(`performance.${key}` as ContentTextKey)}</dt><dd>{messages.number(value)}</dd>
      </Fragment>)}</DefinitionList>
    </Stack></Disclosure>
  </Stack>;
}

export function PerformanceReport({ result, locale }: { result: PerformancePageResult; locale: string }) {
  const messages = createContentMessages(locale), query = result.query;
  const retry = query ? `/en/how-it-works?${performanceParameters(query)}#performance` : "/en/how-it-works#performance";
  return <Stack as="section" id="performance" aria-labelledby="performance-heading" $gap="lg">
    <SectionHeading id="performance-heading">{messages.text("performance.title")}</SectionHeading>
    <BodyText>{messages.text("performance.intro")}</BodyText>
    <Stack as="form" action="/en/how-it-works#performance" method="get" aria-label={messages.text("performance.filters")} $gap="md">
      <BodyText>{messages.text("performance.periodHint")}</BodyText>
      <Inline><TextInput type="date" name="from" required label={messages.text("performance.from")} defaultValue={query?.range.startDate} />
        <TextInput type="date" name="to" required label={messages.text("performance.to")} defaultValue={query?.range.endDate} /></Inline>
      <SelectInput name="market" label={messages.text("performance.market")} defaultValue={query?.market ?? "all"}>
        <option value="all">{messages.text("performance.all")}</option>
        {performanceFamilies.map((family) => <option key={family} value={family}>{messages.text(`market.family.${family}`)}</option>)}
      </SelectInput>
      <SelectInput name="source" label={messages.text("performance.source")} defaultValue={query?.source ?? "combined"}>
        {(["combined", "ai", "api-football"] as const).map((source) => <option key={source} value={source}>{messages.text(`performance.source.${source}`)}</option>)}
      </SelectInput>
      <Disclosure $plain open={Boolean(query?.model || query?.version)}><summary>{messages.text("performance.versionsFilter")}</summary><Stack $gap="md">
        <TextInput name="model" maxLength={64} pattern="[a-f0-9]{64}" label={messages.text("performance.model")} hint={messages.text("performance.modelHint")} defaultValue={query?.model ?? ""} />
        <TextInput name="version" maxLength={128} label={messages.text("performance.version")} defaultValue={query?.version ?? ""} />
      </Stack></Disclosure>
      <Inline><Button type="submit">{messages.text("performance.apply")}</Button><TextLink href="/en/how-it-works#performance" prefetch={false}>{messages.text("performance.reset")}</TextLink></Inline>
    </Stack>
    {result.error && <Surface data-performance-error><Stack $gap="sm"><BodyText>{messages.text(`performance.${result.error}`)}</BodyText>
      {result.error !== "invalid-query" && <TextLink href={retry} prefetch={false}>{messages.text("performance.retry")}</TextLink>}
    </Stack></Surface>}
    {result.data && <StoredReport data={result.data} locale={locale} />}
  </Stack>;
}
