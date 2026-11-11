"use client";

import { Fragment, memo, useId, useMemo, useState } from "react";
import { PredictionOdds, PredictionOutcome } from "@/components/match/prediction-presentation";
import { SelectInput } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import type { BookmakerMarket, PreMatchBookmakerOdds } from "@/domain/bookmaker-odds";
import { displayMarketOddsPrice, type MarketOddsObservation } from "@/domain/in-play-odds";
import { Facts, Note, Panel, PanelHeading, type Messages } from "./details-ui";
import { marketName } from "./labels";

function QuotedSelections({ selections }: { selections: BookmakerMarket["selections"] }) {
  return selections.map(({ label, line, price }, index) => <Fragment key={JSON.stringify([label, line])}>
    {index > 0 && " · "}<span data-bookmaker-selection>{label}{line === null ? null : <> {line}</>}
      <PredictionOdds odds={displayMarketOddsPrice(price)} /></span>
  </Fragment>);
}

function QuotedSelectionDisclosure({ selections, messages }: { selections: BookmakerMarket["selections"]; messages: Messages }) {
  const [open, setOpen] = useState(false);
  return <Disclosure $plain onToggle={(event) => setOpen(event.currentTarget.hasAttribute("open"))}>
    <summary>{messages.text(open ? "touchline.hidePrices" : "touchline.showPrices")}</summary>
    {open && <QuotedSelections selections={selections} />}
  </Disclosure>;
}

const BookmakerMarketRows = memo(function BookmakerMarketRows({ markets, messages, search }: {
  markets: readonly BookmakerMarket[]; messages: Messages; search: string;
}) {
  const shown = useMemo(() => {
    const needle = search.normalize("NFC").trim().toLocaleLowerCase();
    if (!needle) return markets;
    return markets.flatMap((market) => {
      if (market.name.toLocaleLowerCase().includes(needle)) return [market];
      const selections = market.selections.filter(({ label, line }) => (line === null ? label : `${label} ${line}`).toLocaleLowerCase().includes(needle));
      return selections.length ? [{ ...market, selections }] : [];
    });
  }, [markets, search]);
  if (!shown.length) return <Note>{messages.text("details.noMarketMatch", { query: search })}</Note>;
  return <Facts>{shown.map(({ betId, name, selections }) => <Fragment key={betId}>
    <dt data-bookmaker-market={betId}>{name}</dt>
    <dd>{selections.length > 12 ? <QuotedSelectionDisclosure selections={selections} messages={messages} />
      : <QuotedSelections selections={selections} />}</dd>
  </Fragment>)}</Facts>;
});

export function BookmakerOddsPanel({ observation, messages, search }: { observation: PreMatchBookmakerOdds; messages: Messages; search: string }) {
  const heading = useId(), [bookmaker, setBookmaker] = useState<number | null>(null);
  const book = observation.books.find(({ bookmakerId }) => bookmakerId === bookmaker) ?? observation.books[0]!;
  const title = messages.text(observation.kind === "closing" ? "touchline.closingOdds" : "touchline.preMatchOdds");
  const bookName = ({ bookmakerId, name }: PreMatchBookmakerOdds["books"][number]) =>
    name ?? messages.text("touchline.bookmakerNumber", { id: messages.number(bookmakerId, { useGrouping: false }) });
  return <Panel as="section" aria-labelledby={heading} data-market-odds={observation.kind}>
    <PanelHeading id={heading}>{title}{observation.books.length === 1 ? <> · {bookName(book)}</> : null}</PanelHeading>
    {observation.books.length > 1 && <SelectInput label={messages.text("touchline.bookmaker")} value={book.bookmakerId}
      onChange={(event) => setBookmaker(Number(event.currentTarget.value))}>
      {observation.books.map((entry) => <option key={entry.bookmakerId} value={entry.bookmakerId}>
        {bookName(entry)}
      </option>)}
    </SelectInput>}
    <BookmakerMarketRows key={book.bookmakerId} markets={book.markets} messages={messages} search={search} />
    {observation.limited && <Note>{messages.text("touchline.oddsDisplayLimit")}</Note>}
  </Panel>;
}

export function MarketOddsPanel({ kind, observation, messages, search = "" }: { kind: MarketOddsObservation["kind"];
  observation?: Pick<MarketOddsObservation, "prices"> | null | undefined; messages: Messages; search?: string }) {
  const heading = useId();
  if (!observation || observation.prices.state === "unavailable") return null;
  return <Panel as="section" aria-labelledby={heading} data-market-odds={kind}>
    <PanelHeading id={heading}>{messages.text(kind === "in-play" ? "details.odds" : "touchline.preMatchOdds")}</PanelHeading>
    {observation.prices.state === "suspended" ? <Note role="status">{messages.text("touchline.inPlayOddsSuspended")}</Note>
      : observation.prices.providerMarkets ? <BookmakerMarketRows markets={observation.prices.providerMarkets} messages={messages} search={search} />
      : <Facts>{observation.prices.markets.map(({ family, selections }) => <Fragment key={family}>
        <dt>{marketName(messages, family)}</dt>
        <dd>{selections.map(({ selection, price }, index) => <Fragment key={selection}>
          {index > 0 && " · "}<PredictionOutcome messages={messages} selection={selection} /><PredictionOdds odds={displayMarketOddsPrice(price)} />
        </Fragment>)}</dd>
      </Fragment>)}
      {observation.prices.total15Prices && <>
        <dt>{marketName(messages, "total-goals")} · 1.5</dt><dd>
          {observation.prices.total15Prices.map(({ selection, price }, index) => <Fragment key={selection}>
            {index > 0 && " · "}{messages.text(selection === "over" ? "touchline.over15" : "touchline.under15")}
            <PredictionOdds odds={displayMarketOddsPrice(price)} />
          </Fragment>)}
        </dd>
      </>}
      </Facts>}
  </Panel>;
}
