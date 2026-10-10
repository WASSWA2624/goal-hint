"use client";

import Link from "next/link";
import { useRef } from "react";
import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { pageOf, type InsightResult, type InsightSections } from "@/domain/match-insights";
import { openItem } from "@/domain/match-view";
import { matchHref } from "@/domain/navigation";
import { ContextIcon, ExternalIcon, HistoryIcon, NewsIcon, RefereeIcon } from "./details-icons";
import { ChoiceGroup, Crest, Facts, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong, focusRing, useDetails } from "./details-ui";
import { ItemPanel, SectionCard, useReturnFocus } from "./section-card";
import { RecordPanel } from "./team-sections";
import { useInsightSection } from "./use-match-view";

type NewsItem = InsightSections["news"]["items"][number];
const at = (value: number) => utcInstantFromEpochMilliseconds(value);

const NewsRow = styled(RowButton)`
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  @container details-card (min-width: 16rem) { grid-template-columns: auto minmax(0, 1fr); }
  > span[data-text] { display: grid; gap: 1px; min-inline-size: 0; }
  > span[data-text] > b { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > span[data-text] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
`;
const PreviewNews = styled(RowList)`
  > li:nth-child(n + 2) { display: none; }
  @container details-card (min-width: 17rem) { > li:nth-child(n + 2) { display: list-item; } }
`;
const SmallLogo = styled.img`flex: none; inline-size: 18px; block-size: 18px; object-fit: contain;`;
const ExternalLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  color: ${({ theme }) => theme.color.accent.blue.solid};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${focusRing}
`;

function NewsRows({ items }: { items: readonly NewsItem[] }) {
  const { messages, view, go } = useDetails();
  return <>{items.map((item) => <li key={item.id}>
    <NewsRow type="button" data-item-key={item.id} onClick={() => go(openItem(view, "news", item.id))}>
      <Pill $accent={item.kind === "analysis" ? "violet" : "blue"}>{messages.text(`details.newsKind.${item.kind}`)}</Pill>
      <span data-text><b>{item.title}</b><small>{item.publisher}{item.publishedAt !== null && <> · {messages.reportingInstant(at(item.publishedAt))}</>}</small></span>
    </NewsRow>
  </li>)}</>;
}

export function NewsSection() {
  const { preview, messages, view, go, fixtureId } = useDetails();
  const open = view.section === "news";
  const news = useInsightSection(fixtureId, "news", open);
  const items = news.data?.items ?? preview?.sections.news.items ?? [];
  const total = news.data?.items.length ?? preview?.totals.news ?? 0;
  const kind = (["report", "analysis"] as const).find((entry) => entry === view.tab) ?? null;
  const filtered = items.filter((item) => kind === null || item.kind === kind), paged = pageOf(filtered, view.page, 10);
  const selected = view.item ? items.find((item) => item.id === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const limited = news.data?.limitedNews ?? preview?.sections.news.limitedNews ?? false;
  return <SectionCard section="news" icon={<NewsIcon />} accent="blue" title={messages.text("details.section.news")}
    meta={total ? messages.plural("details.itemCount", total) : null} viewAll={messages.text("details.viewAll.news")}
    itemLabel={selected?.title.slice(0, 60) ?? null}
    preview={(preview?.sections.news.items.length ?? 0) > 0
      ? <PreviewNews><NewsRows items={preview!.sections.news.items} /></PreviewNews> : <Note>{messages.text("details.newsNone")}</Note>}>
    <SectionState loading={news.loading} error={news.error} onRetry={news.retry} />
    {selected ? <ItemPanel itemKey={selected.id} title={selected.title}>
      <Pill $accent={selected.kind === "analysis" ? "violet" : "blue"}>{messages.text(`details.newsKind.${selected.kind}`)}</Pill>
      <Facts>
        <dt>{messages.text("details.publisher")}</dt><dd>{selected.publisher}</dd>
        <dt>{messages.text("detail.sourcePublished")}</dt><dd>{selected.publishedAt === null ? messages.text("detail.unknownTime")
          : <time dateTime={toUtcIsoString(at(selected.publishedAt))}>{messages.reportingInstant(at(selected.publishedAt))}</time>}</dd>
        {selected.retrievedAt !== null && <><dt>{messages.text("detail.retrieved")}</dt><dd>
          <time dateTime={toUtcIsoString(at(selected.retrievedAt))}>{messages.reportingInstant(at(selected.retrievedAt))}</time></dd></>}
      </Facts>
      {selected.details.length > 0 && <ul style={{ margin: 0, paddingInlineStart: "1.1rem", fontSize: "0.8125rem", display: "grid", gap: 4 }}>
        {selected.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
      <Note>{messages.text(selected.kind === "analysis" ? "details.analysisNote" : "details.reportNote")}</Note>
      {selected.url && <ExternalLink href={selected.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {messages.text("details.readOriginal")}<ExternalIcon /></ExternalLink>}
    </ItemPanel> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        <ChoiceGroup label={messages.text("details.newsType")} value={kind ?? "all"} onChange={(value: string) => go({ ...view, tab: value === "all" ? null : value, page: 1 }, "replace")}
          options={[{ value: "all", label: messages.text("details.allItems") }, { value: "report", label: messages.text("details.newsKind.report") },
            { value: "analysis", label: messages.text("details.newsKind.analysis") }]} />
      </PanelBar>
      {paged.items.length ? <RowList><NewsRows items={paged.items} /></RowList> : <Note>{messages.text("details.newsNone")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => go({ ...view, page }, "replace")} />
      {limited && <Note>{messages.text("match.limitedNews")}</Note>}
      <Note>{messages.text("details.newsBasis")}</Note>
    </div>}
  </SectionCard>;
}

export function ContextSection() {
  const { data, preview, messages, home, away, view, go, fixtureId, locale } = useDetails();
  const open = view.section === "context";
  const context = useInsightSection(fixtureId, "context", open);
  const value = context.data ?? preview?.sections.context ?? null;
  const fixture = data.fixture;
  const lastResults = value ? [value.lastResults.home, value.lastResults.away].filter((entry): entry is InsightResult => entry !== null) : [];
  const record = view.item ? lastResults.find((entry) => entry.fixtureId === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const rest = (days: number | null) => days === null ? messages.text("details.notAvailable") : messages.text("details.restDays", { days: messages.number(days, { maximumFractionDigits: 1 }) });
  const kickoff = fixture.kickoffAt;
  return <SectionCard section="context" icon={<ContextIcon />} accent="amber" title={messages.text("details.section.context")}
    viewAll={messages.text("details.viewAll.context")} itemLabel={record ? messages.text("match.title", { home: record.home.name ?? "", away: record.away.name ?? "" }) : null}
    preview={<Facts>
      <dt>{messages.text("details.competition")}</dt><dd>{[fixture.competition.name, value?.competition.round].filter(Boolean).join(" · ") || messages.text("match.competitionUnknown")}</dd>
      <dt>{messages.text("details.venue")}</dt><dd>{messages.text("details.notAvailable")}</dd>
      <dt>{messages.text("details.weather")}</dt><dd>{messages.text("details.notAvailable")}</dd>
    </Facts>}>
    <SectionState loading={context.loading} error={context.error} onRetry={context.retry} />
    {record ? <RecordPanel record={record} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <Facts>
        <dt>{messages.text("details.competition")}</dt><dd style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {fixture.competition.logoUrl && <SmallLogo src={fixture.competition.logoUrl} alt="" width={18} height={18} referrerPolicy="no-referrer" />}
          {fixture.competition.name ?? messages.text("match.competitionUnknown")}</dd>
        <dt>{messages.text("details.country")}</dt><dd>{value?.competition.country ?? fixture.competition.country ?? messages.text("details.notAvailable")}</dd>
        <dt>{messages.text("details.round")}</dt><dd>{value?.competition.round ?? messages.text("details.notAvailable")}</dd>
        <dt>{messages.text("match.kickoff")}</dt><dd>{kickoff === null ? messages.text("details.kickoffUnknown")
          : <><time dateTime={toUtcIsoString(kickoff)}>{messages.reportingInstant(kickoff)}</time> · {messages.text("details.timeZone")}</>}</dd>
        <dt>{messages.text("details.status")}</dt><dd>{messages.text(`match.status.${fixture.status}`)}</dd>
        <dt>{messages.text("details.venue")}</dt><dd>{messages.text("details.notAvailable")}</dd>
        <dt>{messages.text("details.weather")}</dt><dd>{messages.text("details.notAvailable")}</dd>
        <dt>{messages.text("details.standings")}</dt><dd>{messages.text("details.notAvailable")}</dd>
        <dt>{messages.text("details.restFor", { team: home })}</dt><dd>{rest(value?.restDays.home ?? null)}</dd>
        <dt>{messages.text("details.restFor", { team: away })}</dt><dd>{rest(value?.restDays.away ?? null)}</dd>
      </Facts>
      <Note>{messages.text("details.restBasis")}</Note>
      <Strong>{messages.text("details.schedule")}</Strong>
      <RowList>
        {(["home", "away"] as const).map((side) => {
          const last = value?.lastResults[side] ?? null, next = value?.nextFixtures[side] ?? null, name = side === "home" ? home : away;
          return <li key={side} style={{ display: "grid", gap: 4, padding: "6px 4px", fontSize: "0.75rem" }}>
            <Strong>{name}</Strong>
            {last ? <RowButton type="button" data-item-key={last.fixtureId} onClick={() => go({ ...view, item: last.fixtureId })} style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
              <Pill $accent="teal">{messages.text("details.lastResult")}</Pill>
              <span>{last.home.name} {messages.number(last.homeGoals)}–{messages.number(last.awayGoals)} {last.away.name}</span>
              <time dateTime={toUtcIsoString(at(last.kickoffAt))}>{messages.reportingDay(at(last.kickoffAt))}</time>
            </RowButton> : <Note>{messages.text("details.noLastResult")}</Note>}
            {next ? <Link href={matchHref(next.fixtureId, next.slug, locale)} prefetch={false} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Pill $accent="violet">{messages.text("details.nextFixture")}</Pill>
              <Crest name={next.home.name} url={next.home.logoUrl} size={16} />{next.home.name} – {next.away.name}
              <span style={{ marginInlineStart: "auto" }}>{messages.reportingDay(at(next.kickoffAt))}</span>
            </Link> : <Note>{messages.text("details.noNextFixture")}</Note>}
          </li>;
        })}
      </RowList>
      <Note>{messages.text("details.contextMissing")}</Note>
    </div>}
  </SectionCard>;
}

export function RefereeSection() {
  const { messages } = useDetails();
  return <SectionCard section="referee" icon={<RefereeIcon />} accent="violet" title={messages.text("details.section.referee")}
    viewAll={messages.text("details.viewAll.referee")}
    preview={<Facts><dt>{messages.text("details.official")}</dt><dd>{messages.text("details.notAvailable")}</dd></Facts>}>
    <Facts>
      <dt>{messages.text("details.official")}</dt><dd>{messages.text("details.notAvailable")}</dd>
      <dt>{messages.text("details.refereeStats")}</dt><dd>{messages.text("details.notAvailable")}</dd>
    </Facts>
    <Note>{messages.text("details.refereeMissing")}</Note>
  </SectionCard>;
}

/** The existing locked revision history, opened inside this match view. */
export function HistorySection() {
  const { data, messages, history } = useDetails();
  const latest = data.history.revisions.entries[0] ?? null, count = data.history.revisions.entries.length;
  return <SectionCard section="history" icon={<HistoryIcon />} accent="teal" title={messages.text("details.section.history")}
    meta={count ? messages.plural("details.revisionCount", count) + (data.history.revisions.next ? "+" : "") : null} viewAll={messages.text("details.viewAll.history")}
    preview={latest ? <Note>{messages.text("details.latestRevision")}{" "}
      <time dateTime={toUtcIsoString(latest.publishedAt)}>{messages.reportingInstant(latest.publishedAt)}</time></Note>
      : <Note>{messages.text("details.noRevisions")}</Note>}>
    {history ?? <Note>{messages.text("details.noRevisions")}</Note>}
  </SectionCard>;
}
