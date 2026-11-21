"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { MarketFilterChoice } from "@/components/ui/market-filter-dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { slipMarketFamilyLabel, type MarketFilterMatches } from "@/domain/market-filter-search";
import { marketSelections } from "@/domain/markets";
import { predictionText } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import type { SlipCriteria } from "@/domain/slip-builder";
import { additionalSlipGoalMarkets, slipMarketFamilies, slipMarketSelections, total15SlipSelections,
  type SlipMarketFamily, type SlipMarketSelection } from "@/domain/slip-markets";
import type { Messages } from "@/i18n/messages";

const MarketFields = styled.fieldset`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  &[hidden] { display: none; }
`;
const Instructions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: var(--gh-spacing-2);
  padding-block-end: var(--gh-spacing-2);
  > p {
    flex: 1 1 var(--gh-size-48);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
  }
`;
const Family = styled(MarketFields)`
  padding-block: var(--gh-spacing-1) var(--gh-spacing-1_5);
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  [data-enhanced="false"] &:first-of-type { border-block-start: 0; }
`;
const FamilyHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  column-gap: var(--gh-spacing-2);
  > label { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const AutomaticButton = styled(Button)`
  && {
    flex: none;
    padding-inline: var(--gh-spacing-2);
    font-size: var(--gh-font-secondary);
    &[aria-pressed="true"]:enabled {
      background: ${({ theme }) => theme.color.brandSoft};
      color: ${({ theme }) => theme.color.link};
    }
  }
`;
const Outcomes = styled(MarketFields)`
  padding-inline-start: calc(var(--gh-size-4) + var(--gh-spacing-1_5));
  &:disabled label { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  label { font-size: var(--gh-font-secondary); }
`;
const OutcomeRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-24)), 1fr));
  column-gap: var(--gh-spacing-2);
`;
const GoalRow = styled(OutcomeRow)`
  grid-template-columns: repeat(2, minmax(0, 1fr));
  &[hidden] { display: none; }
`;
const TeamGroups = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-44)), 1fr));
  gap: var(--gh-spacing-2);
`;
const Side = styled(MarketFields)`
  > legend {
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
`;

const matchGoalRows = [total15SlipSelections, marketSelections["total-goals"],
  ...additionalSlipGoalMarkets.filter(({ metric }) => metric === "total").map(({ over, under }) => [over, under] as const)];
const teamGoalRows = (["home", "away"] as const).map((side) => ({
  side,
  rows: additionalSlipGoalMarkets.filter(({ metric }) => metric === side).map(({ over, under }) => [over, under] as const),
}));

type SelectedOutcomes = NonNullable<SlipCriteria["outcomes"]>;

export function allSlipMarketsAutomatic(markets: readonly SlipMarketFamily[], outcomes: SelectedOutcomes) {
  return markets.length === publicPolicy.markets.length &&
    publicPolicy.markets.every((family) => markets.includes(family) && !outcomes[family]?.length);
}

export function slipMarketFilterSummary(messages: Messages, markets: readonly SlipMarketFamily[], outcomes: SelectedOutcomes) {
  const count = messages.plural("slips.marketCount", markets.length);
  if (!markets.length) return count;
  if (markets.every((family) => !outcomes[family]?.length)) return messages.text("slips.summary.markets", {
    markets: count, results: messages.text("slips.summary.automaticResults"),
  });
  return slipMarketFamilies.filter((family) => markets.includes(family)).map((family) => {
    const label = slipMarketFamilyLabel(messages, family), values = outcomes[family];
    const choice = values?.length ? values.map((value) => predictionText(messages, value)).join(", ") : messages.text("slips.automatic");
    return `${label} (${choice})`;
  }).join(" · ");
}

export function SlipMarketFilterFields({ messages, prefix, matches, enhanced, selectedMarkets, outcomes, invalidField, errorId,
  onMarketToggle, onOutcomesChange, onAutomaticMarkets }: Readonly<{
  messages: Messages;
  prefix: string;
  matches: MarketFilterMatches | null;
  enhanced: boolean;
  selectedMarkets: readonly SlipMarketFamily[];
  outcomes: SelectedOutcomes;
  invalidField: string | undefined;
  errorId: string;
  onMarketToggle: (family: SlipMarketFamily) => void;
  onOutcomesChange: (family: SlipMarketFamily, values: readonly SlipMarketSelection[]) => void;
  onAutomaticMarkets: () => void;
}>) {
  const automatic = messages.text("slips.automatic");
  const helpId = `${prefix}-market-choices-hint`;

  return <MarketFields data-criteria-field="markets"
    hidden={matches !== null && matches.families.size === 0 && matches.outcomes.size === 0}
    aria-describedby={invalidField === "markets" || invalidField === "outcomes" ? errorId : enhanced && !matches ? helpId : undefined}>
    <VisuallyHidden as="legend">{messages.text("slips.accordion.markets")}</VisuallyHidden>
    {enhanced && matches === null && <Instructions>
      <p id={helpId}>{messages.text("slips.marketsHint")}</p>
      <AutomaticButton type="button" variant="quiet" disabled={allSlipMarketsAutomatic(selectedMarkets, outcomes)}
        onClick={onAutomaticMarkets}>{messages.text("slips.restoreMarketDefaults")}</AutomaticButton>
    </Instructions>}
    {slipMarketFamilies.map((family) => {
      const enabled = selectedMarkets.includes(family), label = slipMarketFamilyLabel(messages, family);
      const selected: readonly SlipMarketSelection[] = outcomes[family] ?? [];
      const visible = matches?.outcomes.get(family);
      const name = `picks.${family}`;
      const renderChoice = (selection: SlipMarketSelection, compactTeamLabel = false) => {
        const description = predictionText(messages, selection);
        const optionLabel = compactTeamLabel ? predictionText(messages, selection.slice(selection.indexOf("-") + 1)) : description;
        return <MarketFilterChoice key={selection} hidden={visible !== undefined && !visible.has(selection)}>
          <input type="checkbox" name={name} value={selection} checked={enabled && selected.includes(selection)}
            aria-label={compactTeamLabel ? description : undefined}
            onChange={(event) => onOutcomesChange(family,
              event.target.checked ? [...selected, selection] : selected.filter((value) => value !== selection))} />
          {optionLabel}
        </MarketFilterChoice>;
      };
      const renderPair = (row: readonly [SlipMarketSelection, SlipMarketSelection], compactTeamLabel = false) =>
        <GoalRow key={row[0]} hidden={visible !== undefined && !row.some((selection) => visible.has(selection))}>
          {row.map((selection) => renderChoice(selection, compactTeamLabel))}
        </GoalRow>;

      return <Family key={family} data-market-family={family} hidden={matches !== null && !matches.families.has(family) && !visible}>
        <VisuallyHidden as="legend">{label}</VisuallyHidden>
        <FamilyHeader>
          <MarketFilterChoice>
            <input type="checkbox" name="markets" value={family} checked={enabled} onChange={() => onMarketToggle(family)}
              aria-invalid={invalidField === "markets" || undefined} />
            {label}
          </MarketFilterChoice>
          {enhanced && <AutomaticButton type="button" variant="quiet" aria-label={messages.text("slips.marketAutomaticLabel", { market: label })}
            aria-pressed={enabled && selected.length === 0} disabled={!enabled} onClick={() => onOutcomesChange(family, [])}>
            {automatic}
          </AutomaticButton>}
        </FamilyHeader>
        <Outcomes disabled={enhanced && !enabled} aria-invalid={invalidField === "outcomes" || undefined}
          aria-describedby={invalidField === "outcomes" ? errorId : undefined}>
          <VisuallyHidden as="legend">{messages.text("slips.outcomeLabel", { market: label })}</VisuallyHidden>
          {family === "total-goals" ? matchGoalRows.map((row) => renderPair(row)) : family === "team-goals"
            ? <TeamGroups>
              {teamGoalRows.map(({ side, rows }) =>
                <Side key={side} hidden={visible !== undefined && !rows.some((row) => row.some((selection) => visible.has(selection)))}>
                  <legend>{messages.text(`market.selection.${side}-team`)}</legend>
                  {rows.map((row) => renderPair(row, true))}
                </Side>)}
            </TeamGroups>
            : <OutcomeRow>{slipMarketSelections[family].map((selection) => renderChoice(selection))}</OutcomeRow>}
        </Outcomes>
      </Family>;
    })}
  </MarketFields>;
}
