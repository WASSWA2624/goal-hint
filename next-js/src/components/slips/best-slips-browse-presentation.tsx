"use client";

import styled from "styled-components";
import { useEffect, useRef } from "react";
import type { BestSlipView, BestSlipsResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { FilterButton, FiltersRow } from "./best-slips-filter-styles";

const Summary = styled(FiltersRow)`
  justify-content: space-between;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
`;
const Publication = styled.div`
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 5px 10px 3px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem;
  [data-outcome="won"] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  [data-outcome="lost"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  [data-outcome="pending"] { color: ${({ theme }) => theme.color.outcome.pending.text}; }
`;

export function BestSlipsSummary({ result, period, locale }: { result: BestSlipsResult; period: string; locale: string }) {
  const m = createMessages(locale), browse = result.browse;
  const total = browse?.total ?? (browse ? null : result.slips.length);
  const first = result.slips.length ? ((browse?.query.page ?? 1) - 1) * (browse?.pageSize ?? result.slips.length) + 1 : 0;
  const dates = browse?.total === null && browse.from && browse.to
    ? m.text("bestSlips.filters.allDatesRange", { from: m.reportingDateMedium(browse.from), to: m.reportingDateMedium(browse.to) }) : period;
  return <Summary data-best-slips-summary aria-live="polite">
    <span>{total === null ? m.text("bestSlips.filters.shown", { count: m.number(result.slips.length) })
      : m.text("bestSlips.filters.showing", { first: m.number(first), last: m.number(result.slips.length ? first + result.slips.length - 1 : 0), total: m.number(total) })}</span>
    <span>{dates}</span>
  </Summary>;
}

export function BestSlipsPagination({ previous, next, canPrevious, canNext, page, busy, locale }: {
  previous: () => void; next: () => void; canPrevious: boolean; canNext: boolean; page: number; busy: boolean; locale: string;
}) {
  const m = createMessages(locale);
  const before = useRef<HTMLButtonElement>(null), after = useRef<HTMLButtonElement>(null);
  const direction = useRef<"previous" | "next" | null>(null), wasBusy = useRef(busy);
  useEffect(() => {
    const active = document.activeElement;
    if (wasBusy.current && !busy && direction.current && (active === document.body || active === before.current || active === after.current)) {
      const preferred = direction.current === "previous" ? before.current : after.current;
      const fallback = direction.current === "previous" ? after.current : before.current;
      if (preferred && !preferred.disabled) preferred.focus({ preventScroll: true });
      else if (fallback && !fallback.disabled) fallback.focus({ preventScroll: true });
    }
    wasBusy.current = busy;
  }, [busy, canPrevious, canNext]);
  return <FiltersRow as="nav" aria-label={m.text("bestSlips.filters.title")} data-best-slips-pagination>
    <FilterButton ref={before} type="button" disabled={!canPrevious || busy} onClick={() => { direction.current = "previous"; previous(); }}>{m.text("bestSlips.filters.previous")}</FilterButton>
    <span>{m.text("bestSlips.filters.page", { page: m.number(page) })}</span>
    <FilterButton ref={after} type="button" disabled={!canNext || busy} onClick={() => { direction.current = "next"; next(); }}>{m.text("bestSlips.filters.next")}</FilterButton>
  </FiltersRow>;
}

export function SlipPublicationMeta({ view, locale }: { view: BestSlipView; locale: string }) {
  const m = createMessages(locale);
  if (!view.publicationDay && !view.outcome) return null;
  return <Publication data-slip-publication>
    {view.publicationDay && <time dateTime={view.publicationDay}>{m.reportingDateMedium(view.publicationDay)} · EAT</time>}
    {view.outcome && <span data-outcome={view.outcome}>{m.text(`slips.header.${view.outcome}`)}</span>}
  </Publication>;
}
