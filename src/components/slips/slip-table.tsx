"use client";

import Link from "@/components/navigation/navigation-link";
import { useId } from "react";
import { PredictionOdds, ProbabilityBar } from "@/components/match/prediction-presentation";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import type { BuiltSlip, SlipSelection } from "@/domain/slip-builder";
import { createMessages, type Messages } from "@/i18n/messages";
import { SlipCard, SlipMarket, SlipPick, SlipSummary, SlipTitle, Table } from "./slip-styles";

function percent(value: number, messages: Messages): string {
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function SlipTeam({ team, name, side }: { team: SlipSelection["homeTeam"]; name: string; side: "home" | "away" }) {
  return <span data-team-side={side}>
    <TeamLogo name={team.name} url={isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined} eager={false} />
    <span data-team-name>{name}</span>
  </span>;
}

function SlipProbability({ selection, label }: { selection: SlipSelection; label: string }) {
  return <span data-probability-content>
    <ProbabilityBar $family={selection.family} aria-hidden="true" data-probability-meter>
      <span style={{ inlineSize: `${selection.probability * 100}%` }} />
    </ProbabilityBar>
    <strong>{label}</strong>
  </span>;
}

/** Saved selections retain their own pick, probability and odds in a single semantic match row. */
export function SlipTable({ slip, index, locale }: { slip: BuiltSlip; index: number; locale: string }) {
  const messages = createMessages(locale), headingId = useId();
  return <SlipCard data-slip-id={slip.id}>
    <SlipTitle>
      <h3 id={headingId}>{messages.text("slips.slipTitle", { number: messages.number(index + 1) })}</h3>
      {index === 0 && <span>{messages.text("slips.topRanked")}</span>}
      <SlipSummary data-slip-summary>
        <div><dt>{messages.text("slips.totalOdds")}</dt><dd>{slip.totalOdds}</dd></div>
        <div><dt><span aria-hidden="true">{messages.text("slips.averageShort")}</span><VisuallyHidden>{messages.text("slips.average")}</VisuallyHidden></dt>
          <dd>{percent(slip.averageProbability, messages)}</dd></div>
        <div><dt><VisuallyHidden>{messages.text("slips.selectionCount")}</VisuallyHidden></dt>
          <dd>{messages.plural("slips.selections", slip.selections.length)}</dd></div>
      </SlipSummary>
    </SlipTitle>
    <Table aria-labelledby={headingId}>
      <thead><tr>
        <th scope="col" data-column="match">{messages.text("slips.match")}</th>
        <th scope="col" data-column="selection">{messages.text("slips.marketPick")}</th>
        <th scope="col" data-column="kickoff">{messages.text("slips.kickoffColumn")}</th>
        <th scope="col" data-column="probability">{messages.text("slips.probability")}</th>
      </tr></thead>
      <tbody>{slip.selections.map((selection) => {
        const home = selection.homeTeam.name?.trim() || messages.text("match.homeUnknown");
        const away = selection.awayTeam.name?.trim() || messages.text("match.awayUnknown");
        const at = utcInstantFromEpochMilliseconds(selection.kickoffAt);
        const kickoff = `${messages.reportingDateShort(getReportingDate(at))} · ${messages.reportingTime(at)} EAT`;
        const probability = percent(selection.probability, messages);
        const family = messages.text(`market.family.${selection.family}`);
        const pick = messages.text(selection.family === "total-goals"
          ? `market.pickPlain.${selection.selection}` : `market.pick.${selection.selection}`);
        return <tr key={selection.fixtureId} data-slip-selection={selection.fixtureId}>
          <td data-column="match">
            <span data-mobile="metadata">
              <span data-competition title={selection.competition.name ?? undefined}>{selection.competition.name || messages.text("match.competitionUnknown")}</span>
              <time dateTime={toUtcIsoString(at)}>{kickoff}</time>
            </span>
            <Link href={matchHref(selection.fixtureId, canonicalMatchSlug(home, away), locale)} prefetch={false} data-team-list>
              <SlipTeam team={selection.homeTeam} name={home} side="home" />
              <span data-versus> v </span>
              <SlipTeam team={selection.awayTeam} name={away} side="away" />
            </Link>
          </td>
          <td data-column="selection">
            <SlipMarket $family={selection.family} data-market>
              <span aria-hidden="true">{messages.text(`market.code.${selection.family}`)}</span>
              <VisuallyHidden>{family}</VisuallyHidden>
            </SlipMarket>
            <SlipPick $family={selection.family} data-slip-pick>
              <span aria-hidden="true" data-pick-selection>{pick}</span>
              <VisuallyHidden>{messages.text(`market.selection.${selection.selection}`)}. {messages.text("slips.odds")}: </VisuallyHidden>
              <PredictionOdds odds={selection.odds} />
            </SlipPick>
            <span data-mobile="probability">
              <VisuallyHidden>{messages.text("slips.probability")}: </VisuallyHidden>
              <SlipProbability selection={selection} label={probability} />
            </span>
          </td>
          <td data-column="kickoff"><time dateTime={toUtcIsoString(at)}>{kickoff}</time></td>
          <td data-column="probability"><SlipProbability selection={selection} label={probability} /></td>
        </tr>;
      })}</tbody>
    </Table>
  </SlipCard>;
}
