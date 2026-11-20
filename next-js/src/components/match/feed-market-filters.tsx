"use client";

import { useId, useMemo, useState } from "react";
import styled from "styled-components";
import { FilterFieldRow, FilterSection } from "@/components/ui/advanced-filter-dialog";
import { Button, TextButton } from "@/components/ui/controls";
import { focusRing } from "@/components/ui/filter-chrome";
import { ChartIcon, ChevronDownIcon, GroupIcon, SortIcon, TrophyIcon } from "@/components/ui/icons";
import { MutedText } from "@/components/ui/layout";
import { MarketFilterChoice, MarketFilterDialog } from "@/components/ui/market-filter-dialog";
import { periodShortForms } from "@/domain/betting-short-forms";
import { feedMarketPickIdentity, type FeedMarketPick, type FeedMarketPickIdentity } from "@/domain/feed-market-picks";
import { isAnyMarkets, type FeedQuery } from "@/domain/feed-query";
import { searchMarketFilters, searchPublishedMarkets } from "@/domain/market-filter-search";
import { marketRegistry, type RegisteredMarketFamily } from "@/domain/market-registry";
import { isMarketFamily } from "@/domain/markets";
import { predictionLabel, predictionText } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import { goalMarketPeriods, type GoalRule } from "@/domain/score-distribution-markets";
import { createMessages, type Messages } from "@/i18n/messages";

export type FeedMarketDraft = Pick<FeedQuery, "markets" | "marketPicks">;

const Views = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-1_5);
  > button {
    padding-inline: var(--gh-spacing-1); min-block-size: var(--form-control-height);
    font-size: var(--gh-font-secondary); white-space: normal; overflow-wrap: anywhere;
  }
  > button[aria-pressed="true"] {
    background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link};
    box-shadow: inset 0 calc(-1 * var(--gh-stroke-strong)) ${({ theme }) => theme.color.link};
  }
`;
const Family = styled.section`
  min-inline-size: 0;
  & + & { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
`;
const FamilyButton = styled.button`
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: var(--gh-spacing-2);
  inline-size: 100%; min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) 0; border: 0; background: none; color: ${({ theme }) => theme.color.text};
  font: inherit; font-weight: var(--gh-weight-semibold); text-align: start; cursor: pointer; overflow-wrap: anywhere;
  > small { color: ${({ theme }) => theme.color.mutedText}; font-weight: var(--gh-weight-body); font-size: var(--gh-font-secondary); }
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); color: ${({ theme }) => theme.color.mutedText}; }
  &[aria-expanded="true"] > svg { transform: rotate(180deg); }
  ${focusRing}
`;
const FamilyName = styled.span`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1);
  min-inline-size: 0; font-size: var(--gh-font-body);
`;
const FamilyIcon = styled.span`
  display: grid; place-items: center; inline-size: var(--gh-size-6); block-size: var(--gh-size-6);
  background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link};
  border-radius: ${({ theme }) => theme.radius.control};
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
`;
const FamilyCount = styled.span`
  padding-inline: var(--gh-spacing-1);
  color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-semibold);
`;
const Scopes = styled.div`padding-inline-start: var(--gh-spacing-2_5);`;
const Scope = styled.section`
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  > h4 {
    display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-3);
    padding-block: var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-semibold);
    overflow-wrap: anywhere;
    > span + span { color: ${({ theme }) => theme.color.mutedText}; font-weight: var(--gh-weight-body); }
  }
`;
const SelectionRow = styled(FilterFieldRow)`
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  gap: var(--gh-spacing-2);
  > label { min-inline-size: 0; padding-block: var(--gh-spacing-0_5); overflow-wrap: anywhere; }
`;
const MarketStatus = styled(MutedText)`padding-block: var(--gh-spacing-2); font-size: var(--gh-font-body);`;
const SelectionSummary = styled.div`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0 var(--gh-spacing-2);
  min-block-size: var(--form-control-height); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
  > button { min-block-size: var(--form-control-height); }
`;

const periods = {
  "full-time": "feed.filters.marketPeriodFull", "half-time": "feed.filters.marketPeriodFirst", "second-half": "feed.filters.marketPeriodSecond",
} as const;
const orderedFamilies = [...new Set<RegisteredMarketFamily>([...publicPolicy.markets, "team-goals", ...Object.keys(marketRegistry) as RegisteredMarketFamily[]])];
const familyTitle = (messages: Messages, family: RegisteredMarketFamily) => family === "total-goals" ? messages.text("slips.totalGoalsMarket")
  : isMarketFamily(family) ? messages.text(`market.family.${family}`) : marketRegistry[family].name;

function numericTerms(rule: GoalRule): { line: number | null; direction: "over" | "under" | null } {
  switch (rule.kind) {
    case "total": case "asian-total": return { line: rule.line, direction: rule.direction };
    case "asian-handicap": return { line: rule.line, direction: null };
    case "handicap-result": return { line: rule.homeHandicap, direction: null };
    case "all": case "none": return rule.rules.map(numericTerms).find(({ line }) => line !== null) ?? { line: null, direction: null };
    default: return { line: null, direction: null };
  }
}

function option(messages: Messages, { definition, family, id, marketKey, selection }: FeedMarketPickIdentity) {
  const choice = definition.selections.find(({ key }) => key === selection)!;
  const rule = choice.rule, context = { marketKey, rule, label: choice.label };
  const period = messages.text(periods[definition.period]), familyLabel = familyTitle(messages, family);
  const bareName = definition.label.split(" · ").slice(1).join(" · ") || definition.label;
  const totals = rule.kind === "total" || rule.kind === "asian-total";
  const subject = totals ? rule.metric === "total" ? messages.text("feed.filters.marketGoals") : messages.text(`market.selection.${rule.metric}-team`)
    : bareName === familyLabel ? "" : bareName;
  const scopeKey = totals ? `${definition.period}:${rule.metric}` : definition.key;
  const label = predictionText(messages, selection, context), short = predictionLabel(messages, selection, context);
  const code = periodShortForms[definition.period];
  return { id, family, marketKey, definition, period, subject, scopeKey, label, ...numericTerms(rule),
    selectionOrder: definition.selections.indexOf(choice),
    detail: [family, familyLabel, bareName, period, code.code, code.label, definition.period === "half-time" ? "HT" : "", subject, definition.code, short].join(" "),
    accessibleLabel: [familyLabel, period, subject, label].filter(Boolean).join(" · ") };
}
type MarketOption = ReturnType<typeof option>;

function marketOptions(messages: Messages, ids: readonly FeedMarketPick[]) {
  return [...new Set(ids)].flatMap((id) => {
    const identity = feedMarketPickIdentity(id);
    return identity ? [option(messages, identity)] : [];
  }).sort((left, right) => orderedFamilies.indexOf(left.family) - orderedFamilies.indexOf(right.family)
    || goalMarketPeriods.indexOf(left.definition.period) - goalMarketPeriods.indexOf(right.definition.period)
    || left.scopeKey.localeCompare(right.scopeKey) || (left.line ?? 0) - (right.line ?? 0)
    || left.marketKey.localeCompare(right.marketKey) || left.selectionOrder - right.selectionOrder);
}

export function feedMarketLabels(messages: Messages, value: FeedMarketDraft) {
  const families = isAnyMarkets(value.markets) ? [] : publicPolicy.markets.filter(family => value.markets.includes(family))
    .map(family => messages.text(`market.family.${family}`));
  const outcomes = marketOptions(messages, value.marketPicks ?? []).map(({ id, label, accessibleLabel }) => id.includes("~") ? accessibleLabel : label);
  return [...families, ...outcomes];
}

function BroadMarkets({ value, messages, query, onChange }: {
  value: FeedMarketDraft; messages: Messages; query: string; onChange: (value: FeedMarketDraft) => void;
}) {
  const matches = searchMarketFilters(query, messages), families = publicPolicy.markets.filter((family) => !matches || matches.families.has(family));
  if (!families.length) return <MarketStatus role="status">{messages.text("filters.noMatchingMarkets")}</MarketStatus>;
  return <FilterSection aria-label={messages.text("feed.filters.marketFamilies")}>
    {!matches && <MarketFilterChoice><input type="checkbox" checked={isAnyMarkets(value.markets) && !value.marketPicks?.length}
      onChange={() => onChange({ markets: [...publicPolicy.markets] })} />{messages.text("feed.filters.any")}</MarketFilterChoice>}
    <FilterFieldRow data-market-choices>
      {families.map((family) => {
        const checked = value.markets.includes(family), last = checked && value.markets.length === 1;
        return <MarketFilterChoice key={family}>
          {last && <input type="hidden" name="market" value={family} />}
          <input type="checkbox" name="market" value={family} checked={checked} disabled={last}
            title={last ? messages.text("feed.filters.oneMarket") : undefined}
            onChange={() => onChange({ ...value, markets: checked ? value.markets.filter((item) => item !== family) : [...value.markets, family] })} />
          {messages.text(`market.family.${family}`)}
        </MarketFilterChoice>;
      })}
    </FilterFieldRow>
  </FilterSection>;
}

function groupOptions<Key>(choices: readonly MarketOption[], key: (option: MarketOption) => Key) {
  const groups = new Map<Key, MarketOption[]>();
  for (const choice of choices) {
    const value = key(choice), group = groups.get(value);
    if (group) group.push(choice); else groups.set(value, [choice]);
  }
  return groups;
}

function PublishedGroup({ family, choices, selected, initiallyOpen, messages, toggle }: {
  family: RegisteredMarketFamily; choices: readonly MarketOption[]; selected: ReadonlySet<FeedMarketPick>;
  initiallyOpen: boolean; messages: Messages; toggle: (id: FeedMarketPick) => void;
}) {
  const id = useId(), [open, setOpen] = useState(initiallyOpen);
  const count = choices.filter(({ id }) => selected.has(id)).length;
  const Glyph = family === "match-result" ? TrophyIcon : family === "double-chance" ? SortIcon
    : family === "team-goals" || family === "both-teams-to-score" ? GroupIcon : ChartIcon;
  return <Family data-market-family={family}>
    <h3><FamilyButton type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <FamilyIcon><Glyph /></FamilyIcon>
      <FamilyName>{familyTitle(messages, family)}{count > 0 && <FamilyCount aria-label={messages.plural("feed.filters.marketSelected", count)}>
        {messages.number(count)}
      </FamilyCount>}</FamilyName>
      <small>{messages.plural("feed.filters.marketOutcomeCount", choices.length)}</small>
      <ChevronDownIcon />
    </FamilyButton></h3>
    <Scopes id={id} hidden={!open}>
      {open && [...groupOptions(choices, ({ scopeKey }) => scopeKey)].map(([scopeKey, scope]) => {
        const rows = [...groupOptions(scope, ({ marketKey }) => marketKey).values()].flatMap((items) =>
          Array.from({ length: Math.ceil(items.length / 2) }, (_, index) => items.slice(index * 2, index * 2 + 2)));
        const heading = scope[0]!;
        return <Scope key={scopeKey} data-market-period={heading.definition.period}>
          <h4><span>{heading.period}</span>{heading.subject && <span>{heading.subject}</span>}</h4>
          {rows.map((row) => <SelectionRow key={row[0]!.id}>
            {row.map(({ id, label, accessibleLabel }) => <MarketFilterChoice key={id} data-market-outcome={id}>
              <input type="checkbox" value={id} aria-label={accessibleLabel} checked={selected.has(id)} onChange={() => toggle(id)} />{label}
            </MarketFilterChoice>)}
          </SelectionRow>)}
        </Scope>;
      })}
    </Scopes>
  </Family>;
}

const noPicks: readonly FeedMarketPick[] = [];
type MarketView = "families" | "outcomes";
const initialView = (locked: boolean): MarketView => locked ? "families" : "outcomes";
export function FeedMarketPickerDialog({ id, locale, open, value, locked, publishedMarkets, marketsUnavailable, onRetry, onChange, onApply, onCancel }: {
  id: string; locale: string; open: boolean; value: FeedMarketDraft; locked: boolean; publishedMarkets?: readonly FeedMarketPick[] | undefined;
  marketsUnavailable?: boolean | undefined; onRetry?: (() => void) | undefined;
  onChange: (value: FeedMarketDraft) => void; onApply: () => void; onCancel: () => void;
}) {
  const messages = createMessages(locale);
  const [settings, setSettings] = useState({ open, view: initialView(locked), selectedOnly: false });
  if (settings.open !== open) setSettings({ open, view: initialView(locked), selectedOnly: false });
  const { view, selectedOnly } = settings;
  const picks = locked ? noPicks : value.marketPicks ?? noPicks;
  const available = useMemo(() => open && !locked ? marketOptions(messages, publishedMarkets ?? noPicks) : [], [open, locked, messages, publishedMarkets]);
  const retained = useMemo(() => open && !locked ? marketOptions(messages, picks) : [], [open, locked, messages, picks]);
  const selected = useMemo(() => new Set(picks), [picks]);
  const toggle = (id: FeedMarketPick) => onChange({ ...value, marketPicks: selected.has(id)
    ? picks.filter((pick) => pick !== id) : [...picks, id] });
  const outcomes = (needle: string) => {
    if (locked) return <MarketStatus role="status">{messages.text("feed.filters.publishedOutcomesLocked")}</MarketStatus>;
    const showingSelected = selectedOnly && retained.length > 0;
    const options = showingSelected ? retained : searchPublishedMarkets(available, needle);
    if (!options.length) return <MarketStatus role="status">{messages.text(publishedMarkets === undefined
      ? marketsUnavailable ? "feed.filters.marketsUnavailable" : "feed.filters.marketsLoading"
      : publishedMarkets.length ? "filters.noMatchingMarkets" : "feed.filters.marketsEmpty")}
      {publishedMarkets === undefined && marketsUnavailable && onRetry && <>{" "}<TextButton onClick={onRetry}>{messages.text("feed.retry")}</TextButton></>}
    </MarketStatus>;
    return <div data-published-market-picks>
      {[...groupOptions(options, ({ family }) => family)].map(([family, choices]) => <PublishedGroup key={`${family}:${needle}:${showingSelected}`}
        family={family} choices={choices} selected={selected}
        initiallyOpen={Boolean(needle.trim()) || showingSelected || family === "total-goals"} messages={messages} toggle={toggle} />)}
    </div>;
  };
  const mode = (view: MarketView) => setSettings({ open, view, selectedOnly: false });
  return <MarketFilterDialog id={id} locale={locale} open={open} group="markets" onApply={onApply} onCancel={onCancel} published={{
    views: <Views role="group" aria-label={messages.text("feed.filters.markets")}>
      <Button variant="secondary" aria-pressed={view === "families"} onClick={() => mode("families")}>{messages.text("feed.filters.marketFamilies")}</Button>
      <Button variant="secondary" aria-pressed={view === "outcomes"} onClick={() => mode("outcomes")}>{messages.text("feed.filters.publishedOutcomes")}</Button>
    </Views>,
    summary: !locked && <SelectionSummary>
      <span aria-live="polite">{messages.plural("feed.filters.marketSelected", picks.length)}</span>
      {picks.length > 0 && <TextButton onClick={() => setSettings({ open, view: "outcomes", selectedOnly: !(view === "outcomes" && selectedOnly) })}>
        {messages.text(view === "outcomes" && selectedOnly ? "feed.filters.marketShowAll" : "feed.filters.marketShowSelected")}
      </TextButton>}
    </SelectionSummary>,
    fallback: <>
      <BroadMarkets value={value} messages={messages} query="" onChange={onChange} />
      {picks.length > 0 && <input type="hidden" name="marketPick" value={picks.join(",")} />}
    </>,
    resultsBusy: open && !locked && view === "outcomes" && !selectedOnly && publishedMarkets === undefined && !marketsUnavailable,
    results: (needle) => view === "families" ? <BroadMarkets value={value} messages={messages} query={needle} onChange={onChange} /> : outcomes(needle),
  }} />;
}
