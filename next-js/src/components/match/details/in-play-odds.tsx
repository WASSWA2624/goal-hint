"use client";

import { Fragment, useId } from "react";
import { PredictionOdds, PredictionOutcome } from "@/components/match/prediction-presentation";
import type { InPlayOddsObservation } from "@/domain/in-play-odds";
import { Facts, Note, Panel, PanelHeading, type Messages } from "./details-ui";
import { marketName } from "./labels";

function displayPrice(price: string) {
  const [whole, fraction = ""] = price.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function InPlayOddsPanel({ observation, messages }: { observation?: InPlayOddsObservation | null | undefined; messages: Messages }) {
  const heading = useId();
  if (!observation || observation.prices.state === "unavailable") return null;
  return <Panel as="section" aria-labelledby={heading} data-in-play-odds>
    <PanelHeading id={heading}>{messages.text("touchline.inPlayOdds")}</PanelHeading>
    {observation.prices.state === "suspended" ? <Note role="status">{messages.text("touchline.inPlayOddsSuspended")}</Note>
      : <Facts>{observation.prices.markets.map(({ family, selections }) => <Fragment key={family}>
        <dt>{marketName(messages, family)}</dt>
        <dd>{selections.map(({ selection, price }, index) => <Fragment key={selection}>
          {index > 0 && " · "}<PredictionOutcome messages={messages} selection={selection} /><PredictionOdds odds={displayPrice(price)} />
        </Fragment>)}</dd>
      </Fragment>)}</Facts>}
  </Panel>;
}
