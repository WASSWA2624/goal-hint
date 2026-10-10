import "server-only";

import type { MatchDetailResponse } from "@/domain/match-detail";
import { parseReportingDate } from "@/domain/calendar";
import type { DetailPageResult } from "@/server/matches/detail-page";
import { historyNextHref, historyPageHref, historySelectionHref, publicationStatus } from "@/server/matches/history-page";
import { createMessages } from "@/i18n/messages";
import { Disclosure } from "@/components/ui/disclosure";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { BodyText, Inline, MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { DetailTime, HistorySnapshot } from "./match-detail-content";

type Cycle = NonNullable<MatchDetailResponse["selectedCycle"]>;

function CycleSummary({ cycle, locale }: { cycle: Cycle; locale: string }) {
  const messages = createMessages(locale);
  return <Stack $gap="sm">
    <BodyText>{messages.text("history.cycle", { number: messages.number(cycle.ordinal) })} · {messages.text(`history.cycle.${cycle.state}`)}</BodyText>
    {cycle.voidReason && <BodyText>{cycle.voidReason.explanation}</BodyText>}
    <DetailTime label="match.kickoff" at={cycle.kickoffAt} locale={locale} />
    <DetailTime label="history.cutoff" at={cycle.cutoffAt} locale={locale} />
    <DetailTime label="history.opened" at={cycle.openedAt} locale={locale} />
    {cycle.closedAt !== null && <DetailTime label="history.closed" at={cycle.closedAt} locale={locale} />}
    {cycle.lockedAt !== null && <DetailTime label="detail.locked" at={cycle.lockedAt} locale={locale} />}
    {cycle.voidedAt !== null && <DetailTime label="detail.voided" at={cycle.voidedAt} locale={locale} />}
  </Stack>;
}

export function RevisionHistory({ current, result, query, locale = "en" }: {
  current: MatchDetailResponse; result: DetailPageResult; query: string; locale?: string;
}) {
  const messages = createMessages(locale), parameters = new URLSearchParams(query);
  const data = result.data ?? current, { revisions, cycles } = data.history;
  const selected = result.data && (parameters.has("revision") || parameters.has("cycle")) ? result.data : null;
  const nextRevisions = historyNextHref(data, revisions.next), nextCycles = historyNextHref(data, cycles.next);
  return <Disclosure id="revision-history" open={query ? true : undefined} data-revision-history>
    <summary>{messages.text("history.title")}</summary>
    <Stack $gap="lg">
      <BodyText>{messages.text("history.readOnly")}</BodyText>
      <TextLink href="#current-match-summary" prefetch={false}>{messages.text("history.backToSummary")}</TextLink>
      {result.error && <Surface role="status" data-history-error>
        <Stack $gap="sm">
          <BodyText>{messages.text(result.error === "rate-limited" ? "history.busy" : "history.failed")}</BodyText>
          <ButtonLink href={historyPageHref(current, parameters)} prefetch={false}>{messages.text("feed.retry")}</ButtonLink>
        </Stack>
      </Surface>}
      {selected && <Disclosure $plain open data-selected-publication>
        <summary>{messages.text(selected.snapshot?.historical ? "history.historicalSnapshot" : "history.inspectSnapshot")}</summary>
        <Stack $gap="lg">
          <BodyText>{messages.text("history.snapshotDisclosure")}</BodyText>
          {selected.snapshot && <>
            <SectionHeading as="h3">{messages.text("history.publication", { number: messages.number(selected.snapshot.fixtureRevision) })}</SectionHeading>
            <BodyText>{messages.text(`history.status.${selected.snapshot.applicability}`)}</BodyText>
            <MutedText>{messages.text("history.cycleRevision", { number: messages.number(selected.snapshot.cycleRevision) })}</MutedText>
            <DetailTime label="match.published" at={selected.snapshot.publishedAt} locale={locale} />
          </>}
          {selected.selectedCycle && <CycleSummary cycle={selected.selectedCycle} locale={locale} />}
          {selected.snapshot ? <HistorySnapshot data={selected} locale={locale} /> : <BodyText>{messages.text("history.noSnapshot")}</BodyText>}
        </Stack>
      </Disclosure>}
      <Stack>
        <SectionHeading>{messages.text("history.publications")}</SectionHeading>
        <MutedText>{messages.text("history.order")}</MutedText>
        {revisions.entries.length === 0 ? <BodyText>{messages.text("history.noPublications")}</BodyText>
          : <Stack as="ol" reversed start={revisions.entries[0]?.fixtureRevision}>
            {revisions.entries.map((entry) => {
              const status = publicationStatus(entry, current.currentRevisionId);
              return <li key={entry.revisionId} value={entry.fixtureRevision} data-history-revision={entry.revisionId}>
                <Stack $gap="sm">
                  <TextLink href={historySelectionHref(data, parameters, "revision", entry.revisionId)} prefetch={false}
                    aria-current={selected?.snapshot?.revisionId === entry.revisionId ? "true" : undefined}>
                    {messages.text("history.publication", { number: messages.number(entry.fixtureRevision) })}
                  </TextLink>
                  <BodyText>{messages.text("history.runDate")}: <time dateTime={entry.runDate}>{messages.reportingDate(parseReportingDate(entry.runDate))}</time></BodyText>
                  <BodyText>{messages.text("history.cycle", { number: messages.number(entry.cycle.ordinal) })} · {messages.text("history.cycleRevision", { number: messages.number(entry.cycleRevision) })}</BodyText>
                  <BodyText>{entry.sources.map((kind) => messages.text(`market.source.${kind}`)).join(" · ")}</BodyText>
                  <Inline>{(["current", "locked", "superseded", "void"] as const).filter((key) => status[key]).map((key) =>
                    <BodyText key={key}>{messages.text(`history.status.${key}`)}</BodyText>)}</Inline>
                  <DetailTime label="match.published" at={entry.publishedAt} locale={locale} />
                </Stack>
              </li>;
            })}
          </Stack>}
        {nextRevisions && <ButtonLink href={nextRevisions} variant="secondary" prefetch={false}>{messages.text("history.olderPublications")}</ButtonLink>}
      </Stack>
      <Stack>
        <SectionHeading>{messages.text("history.cycles")}</SectionHeading>
        {cycles.entries.length === 0 ? <BodyText>{messages.text("history.noCycles")}</BodyText>
          : <Stack as="ol" reversed start={cycles.entries[0]?.ordinal}>
            {cycles.entries.map((cycle) => <li key={cycle.id} value={cycle.ordinal} data-history-cycle={cycle.id}>
              <Disclosure $plain>
                <summary>{messages.text("history.cycle", { number: messages.number(cycle.ordinal) })} · {messages.text(`history.cycle.${cycle.state}`)}</summary>
                <Stack>
                  <CycleSummary cycle={cycle} locale={locale} />
                  <TextLink href={historySelectionHref(data, parameters, "cycle", cycle.id)} prefetch={false}>
                    {messages.text("history.inspectCycle")}
                  </TextLink>
                </Stack>
              </Disclosure>
            </li>)}
          </Stack>}
        {nextCycles && <ButtonLink href={nextCycles} variant="secondary" prefetch={false}>{messages.text("history.olderCycles")}</ButtonLink>}
      </Stack>
      {query && <TextLink href={historyPageHref(current, new URLSearchParams({ limit: String(current.history.limit) }))}
        prefetch={false}>{messages.text("history.latest")}</TextLink>}
    </Stack>
  </Disclosure>;
}
