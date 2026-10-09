"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Button, ButtonLink, FilterControl, SearchInput } from "@/components/ui/controls";
import { Inline, MutedText, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { feedQueryHref, feedQueryRules, feedStatuses, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";

const FilterPanel = styled.details`
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  padding: ${({ theme }) => theme.space.sm};
  summary {
    min-block-size: ${({ theme }) => theme.control.minHeight};
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.space.sm};
    cursor: pointer;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  summary:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;
const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: ${({ theme }) => theme.space.md};
`;

export function FeedAppliedSummary({ query, leagues }: { query: FeedQuery; leagues: MatchFeedResponse["leagues"] }) {
  const messages = createMessages(query.locale), league = leagues.find((item) => item.id === query.league);
  return <MutedText data-applied-filters>
    {messages.text("feed.filters.applied")}: {messages.text(`market.family.${query.market}`)}
    {" · "}{messages.text(`feed.status.${query.status}`)}
    {" · "}{messages.text(`feed.filters.sort.${query.sort.by}`)}
    {query.league && <> · {league?.name ?? query.league}</>}
    {query.search && <> · {messages.text("feed.filters.search")}: “{query.search}”</>}
  </MutedText>;
}

export function FeedControls({ query, today, leagues, onApply }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (query: FeedQuery) => void;
}) {
  const draft = useAppSelector((state) => state.feed.draft), dispatch = useAppDispatch();
  // Preserve the mounted fields/panel and keyboard focus across server navigations.
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDetailsElement>(null), trigger = useRef<HTMLElement>(null);
  const messages = createMessages(query.locale), reset = resetFeedFilters(query);
  const [action, search = ""] = feedQueryHref(query, today).split("?");
  const hidden = new URLSearchParams(search);
  for (const key of ["q", "league", "status", "market", "sort", "sortMarket", "page"]) hidden.delete(key);
  const active = Number(query.league !== null) + Number(query.status !== "all") + Number(query.market !== "match-result") + Number(query.sort.by !== "kickoff");
  function change(next: FeedQuery) { setError(null); dispatch(draftChanged(next)); }
  function close() { if (panel.current) panel.current.open = false; trigger.current?.focus(); }
  return <form action={action} method="get" aria-label={messages.text("feed.filters.form")} onSubmit={(event) => {
    event.preventDefault();
    try { onApply(applyFeedDraft(draft, today)); setError(null); }
    catch { setError(messages.text("feed.invalidQuery")); }
  }}>
    <Stack $gap="md">
      {[...hidden].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <SearchInput name="q" label={messages.text("feed.filters.search")} value={draft.search}
        maxLength={feedQueryRules.maximumSearchLength} autoComplete="off" error={error}
        hint={messages.text("feed.filters.searchHint")} onChange={(event) => change({ ...draft, search: event.target.value })} />
      <FilterPanel ref={panel} onKeyDown={(event) => {
        if (event.key === "Escape" && panel.current?.open) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
        <summary ref={trigger}><span aria-hidden="true">▾</span>{messages.text("feed.filters.title")}{active > 0 && ` (${active})`}</summary>
        <Stack $gap="md">
          <FilterGrid>
            <FilterControl name="league" label={messages.text("feed.filters.league")} value={draft.league ?? ""}
              onChange={(event) => change({ ...draft, league: event.target.value || null })}>
              <option value="">{messages.text("feed.filters.allLeagues")}</option>
              {draft.league && !leagues.some((item) => item.id === draft.league) && <option value={draft.league}>{draft.league}</option>}
              {leagues.map((league) => <option key={league.id} value={league.id}>
                {league.name ?? messages.text("match.competitionUnknown")}{league.country ? ` · ${league.country}` : ""}
              </option>)}
            </FilterControl>
            <FilterControl name="status" label={messages.text("feed.filters.status")} value={draft.status}
              onChange={(event) => change({ ...draft, status: event.target.value as FeedQuery["status"] })}>
              {feedStatuses.map((status) => <option key={status} value={status}>{messages.text(`feed.status.${status}`)}</option>)}
            </FilterControl>
            <FilterControl name="market" label={messages.text("feed.filters.market")} value={draft.market} onChange={(event) => {
              const market = event.target.value as MarketFamily;
              change({ ...draft, market, sort: draft.sort.by === "probability" ? { by: "probability", market } : draft.sort });
            }}>
              {publicPolicy.markets.map((market) => <option key={market} value={market}>{messages.text(`market.family.${market}`)}</option>)}
            </FilterControl>
            <FilterControl name="sort" label={messages.text("feed.filters.sort")} value={draft.sort.by} onChange={(event) => {
              change({ ...draft, sort: event.target.value === "probability" ? { by: "probability", market: draft.market } : { by: "kickoff" } });
            }}>
              <option value="kickoff">{messages.text("feed.filters.sort.kickoff")}</option>
              <option value="probability">{messages.text("feed.filters.sort.probability")}</option>
            </FilterControl>
          </FilterGrid>
          <MutedText>{messages.text("feed.filters.probabilityHint")}</MutedText>
          <Inline><Button variant="quiet" onClick={close}>{messages.text("feed.filters.close")}</Button></Inline>
        </Stack>
      </FilterPanel>
      <Inline>
        <Button type="submit">{messages.text("feed.filters.apply")}</Button>
        <ButtonLink href={feedQueryHref(reset, today)} variant="secondary" prefetch={false} onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); change(reset); onApply(reset);
        }}>{messages.text("feed.filters.reset")}</ButtonLink>
      </Inline>
      <FeedAppliedSummary query={query} leagues={leagues} />
    </Stack>
  </form>;
}
