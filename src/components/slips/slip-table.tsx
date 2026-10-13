"use client";

import Link from "next/link";
import { useId } from "react";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import type { BuiltSlip } from "@/domain/slip-builder";
import { createMessages, type Messages } from "@/i18n/messages";
import { SlipCard, SlipSummary, SlipTitle, Table } from "./slip-styles";

function percent(value: number, messages: Messages): string {
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A single semantic row per match; narrow screens wrap cells while retaining kickoff and probability. */
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
        <th scope="col" data-column="odds">{messages.text("slips.odds")}</th>
        <th scope="col" data-column="probability">{messages.text("slips.probability")}</th>
      </tr></thead>
      <tbody>{slip.selections.map((selection) => {
        const home = selection.homeTeam.name?.trim() || messages.text("match.homeUnknown");
        const away = selection.awayTeam.name?.trim() || messages.text("match.awayUnknown");
        const at = utcInstantFromEpochMilliseconds(selection.kickoffAt);
        const kickoff = `${messages.reportingDateShort(getReportingDate(at))} · ${messages.reportingTime(at)} EAT`;
        const probability = percent(selection.probability, messages);
        return <tr key={selection.fixtureId} data-slip-selection={selection.fixtureId}>
          <td data-column="match">
            <Link href={matchHref(selection.fixtureId, canonicalMatchSlug(home, away), locale)} prefetch={false}>{home} v {away}</Link>
            <time data-mobile="kickoff" dateTime={toUtcIsoString(at)}>{kickoff}</time>
          </td>
          <td data-column="selection"><span data-market>{messages.text(`market.family.${selection.family}`)}</span>
            <span data-separator> · </span><span>{messages.text(`market.selection.${selection.selection}`)}</span></td>
          <td data-column="kickoff"><time dateTime={toUtcIsoString(at)}>{kickoff}</time></td>
          <td data-column="odds"><strong>{selection.odds}</strong><strong data-mobile="probability">
            <VisuallyHidden>{messages.text("slips.probability")}: </VisuallyHidden>{probability}</strong></td>
          <td data-column="probability"><strong>{probability}</strong></td>
        </tr>;
      })}</tbody>
    </Table>
  </SlipCard>;
}
