"use client";

import { memo } from "react";
import styled from "styled-components";
import { PredictionOdds } from "@/components/match/prediction-presentation";
import { noPickReason } from "@/domain/feed-presentation";
import { detailRecordNotices } from "@/domain/detail-presentation";
import { featuredFamily, liveStanding, marketRow, resultOutlook, selectedDetailPrice } from "@/domain/match-details";
import type { MarketFamily } from "@/domain/markets";
import { media } from "@/styles/theme";
import { DetailOutcome } from "./match-banner";
import { Note, Standing, desktop, focusRing, size, useStableDetails, type Messages } from "./details-ui";
import { marketName, percent, pickLabel } from "./labels";

/** Between the scoreboard and the market rows: full bleed on phones, a framed card on desktop. */
const Box = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
  min-inline-size: 0;
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
  padding: 12px ${({ theme }) => theme.layout.gutter} 14px;
  background: ${({ theme }) => theme.color.surface};
  ${desktop} {
    gap: 11px;
    margin-inline: 0;
    padding: 14px 18px 16px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
`;
const Eyebrow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  > h2 { margin: 0; color: ${({ theme }) => theme.color.link}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: 0.07em; text-transform: uppercase; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; text-align: end; }
`;
const Pick = styled.button<{ $family: MarketFamily }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  > span[data-pick] { display: grid; gap: 3px; min-inline-size: 0; }
  > span[data-pick] > strong { font-size: 1.375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.15; overflow-wrap: anywhere; ${desktop} { font-size: 1.5rem; } }
  > span[data-pick] > small { color: ${({ theme, $family }) => theme.color.market[$family].text}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-chance] { display: grid; justify-items: end; }
  > span[data-chance] > b { font-size: 2.125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 0.95; font-variant-numeric: tabular-nums; ${desktop} { font-size: 2.5rem; } }
  > span[data-chance] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; }
  ${media.hover} { &:hover > span[data-pick] > strong { color: ${({ theme }) => theme.color.link}; } }
`;
const Outlook = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${size("body")};
  line-height: 1.45;
`;
/** Home, draw and away chances as one bar; narrow segments keep the percentage only. */
const Chances = styled.div`
  display: flex;
  gap: 2px;
  block-size: 1.625rem;
  > span {
    min-inline-size: 2.75rem;
    padding-inline: 6px;
    overflow: hidden;
    color: ${({ theme }) => theme.color.onBrand};
    font-size: ${size("secondary")};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1.625rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  > span[data-side="home"] { background: ${({ theme }) => theme.color.accent.orange.solid}; }
  > span[data-side="draw"] { background: ${({ theme }) => theme.color.mutedText}; text-align: center; }
  > span[data-side="away"] { background: ${({ theme }) => theme.color.accent.blue.solid}; text-align: end; }
`;

function outlookText(messages: Messages, outlook: NonNullable<ReturnType<typeof resultOutlook>>, home: string, away: string): string | null {
  const team = (selection: "home-win" | "away-win") => selection === "home-win" ? home : away;
  const parts: string[] = [];
  if (outlook.likeliest === "draw") parts.push(messages.text("details.drawLikeliest"));
  else if (outlook.likeliest) parts.push(messages.text("details.favourites", { team: team(outlook.likeliest) }));
  if (outlook.least) parts.push(messages.text("details.leastLikely", {
    outcome: pickLabel(messages, outlook.least),
  }));
  if (parts.length === 0) return null;
  const text = `${parts.join("; ")}.`;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** Keep attribution and stale-result warnings beside the pick on every viewport and in the initial HTML. */
function PredictionRecord() {
  const { data, messages } = useStableDetails();
  const notices = detailRecordNotices(data);
  return notices.length > 0 ? <Note data-prediction-record>{notices.map((key) => messages.text(key)).join(" · ")}</Note> : null;
}

/**
 * The highest-probability pick with its chance, a plain-language read of the match-result chances, and the
 * home/draw/away split. Tapping the pick opens that market's full details.
 */
export const Verdict = memo(function Verdict() {
  const { data, messages, home, away, update } = useStableDetails();
  const fixture = data.fixture, snapshot = data.snapshot;
  const featured = featuredFamily(data), row = featured ? marketRow(data, featured) : null;
  const outlook = resultOutlook(data);
  if (!featured || !row?.item) return <Box aria-labelledby="verdict-title" data-featured-pick="none">
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2></Eyebrow>
    <strong>{messages.text("details.noPick")}</strong>
    <Note>{messages.text(`match.noPickReason.${noPickReason(fixture)}`)}</Note>
    <PredictionRecord />
  </Box>;
  const item = row.item, price = selectedDetailPrice(data, featured), standing = liveStanding(data, featured);
  const pick = pickLabel(messages, item.market.selection), chance = percent(messages, item.market.selectedProbability);
  const settled = snapshot?.applicability === "historical" ? null : row.outcome?.status ?? (snapshot?.applicability === "void" ? "void" : null);
  const sentence = outlook ? outlookText(messages, outlook, home, away) : null;
  const sides = { "home-win": ["home", pickLabel(messages, "home-win")], draw: ["draw", pickLabel(messages, "draw")],
    "away-win": ["away", pickLabel(messages, "away-win")] } as const;
  return <Box aria-labelledby="verdict-title" data-verdict={featured} data-featured-pick={featured}>
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2>
      {snapshot && <span>{messages.text("details.publishedAt", { time: messages.reportingInstant(snapshot.publishedAt) })}</span>}</Eyebrow>
    <Pick type="button" $family={featured} onClick={() => update((current) => ({ ...current, marketsOpen: true, market: featured }))}
      aria-label={[messages.text("details.featuredOpen", { market: marketName(messages, featured), pick, probability: chance }),
        price ? `${messages.text("details.odds")}: ${price}` : null].filter(Boolean).join(". ")}>
      <span data-pick><strong>{pick}</strong><small>{marketName(messages, featured)}<PredictionOdds odds={price} /></small></span>
      <span data-chance><b>{chance}</b><small>{messages.text("details.chance")}</small></span>
    </Pick>
    {(sentence || standing || (settled && settled !== "pending")) && <Outlook>
      {sentence}{standing && <Standing standing={standing} />}{settled && settled !== "pending" && <DetailOutcome status={settled} />}
    </Outlook>}
    {outlook && <Chances role="img" aria-label={messages.text("details.resultChances", {
      chances: outlook.chances.map(({ selection, probability }) => `${sides[selection][1]} ${percent(messages, probability)}`).join(", ") })}>
      {outlook.chances.map(({ selection, probability }) => <span key={selection} data-side={sides[selection][0]} style={{ flex: `${Math.max(probability, 0.04)} 1 0` }}>
        {probability >= 0.18 ? `${sides[selection][1]} ` : ""}{percent(messages, probability)}</span>)}
    </Chances>}
    <PredictionRecord />
  </Box>;
});
