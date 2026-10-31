"use client";

import { memo } from "react";
import styled from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { GiftIcon, LockIcon, ChevronRightIcon } from "@/components/ui/icons";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { accountSectionHref } from "@/domain/account-navigation";
import { featuredFamily, liveStanding, marketRow, selectedDetailPrice } from "@/domain/match-details";
import { hasMatchPredictionAccess, openDetailTab } from "@/domain/match-detail-tabs";
import { detailRecordNotices } from "@/domain/detail-presentation";
import { PredictionOutcome } from "../prediction-presentation";
import { DetailOutcome } from "./match-banner";
import { ResultIcon } from "./details-icons";
import { Standing, useStableDetails } from "./details-ui";
import { marketName, percent } from "./labels";
import { Verdict } from "./verdict";
import { TouchlineLinkButton, TouchlineSurface } from "./touchline-ui";

const Frame = styled(TouchlineSurface)`
  display: flex; gap: 20px; align-items: center; justify-content: space-between;
  padding: 16px ${({ theme }) => theme.layout.gutter}; border-inline-start: 4px solid ${({ theme }) => theme.color.brand};
  scroll-margin-block-start: calc(var(--app-header-height, 3rem) + 24px);
  background: linear-gradient(90deg, ${({ theme }) => theme.color.brandSoft}, ${({ theme }) => theme.color.surface} 72%);
  @media (max-width: 1199px) { flex-wrap: wrap; gap: 18px; }
`;
const Lead = styled.div`
  display: flex; gap: 12px; align-items: center; min-inline-size: 0; flex: 1;
  > svg { flex: none; inline-size: 36px; block-size: 36px; padding: 7px; color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.surface}; }
  h2 { margin: 0 0 5px; font-size: .6875rem; letter-spacing: .1em; text-transform: uppercase; color: ${({ theme }) => theme.color.brand}; }
  strong { display: block; font-size: 1.125rem; line-height: 1.4; }
  strong > span { color: ${({ theme }) => theme.color.link}; }
  p { margin: 4px 0 0; color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; line-height: 1.5; }
`;
const Numbers = styled.div`
  display: flex; gap: 28px; align-items: center; flex: none; font-variant-numeric: tabular-nums;
  > div { display: grid; gap: 3px; }
  > div + div { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 24px; }
  b { font-size: 1.75rem; line-height: 1.3; }
  small { font-size: .6875rem; color: ${({ theme }) => theme.color.mutedText}; }
  i { display: block; block-size: 4px; background: ${({ theme }) => theme.color.brand}; margin-block-start: 4px; }
`;
const Actions = styled.div`display: grid; justify-items: end; gap: 6px; font-size: .75rem;`;
const Access = styled.div`
  flex: 1; min-inline-size: 0;
  h2 { font-size: .6875rem; letter-spacing: .1em; text-transform: uppercase; color: ${({ theme }) => theme.color.brand}; margin: 0 0 6px; }
  h3 { margin: 0 0 8px; font-size: 1.25rem; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: .8125rem; }
  > div { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-block-start: 16px; }
`;
const Referral = styled.aside`
  flex: 0 1 285px; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 24px;
  > svg { color: ${({ theme }) => theme.color.brand}; inline-size: 24px; block-size: 24px; margin-block-end: 8px; }
  strong { display: block; margin-block-end: 6px; font-size: .875rem; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; line-height: 1.8; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; margin-block-start: 10px; font-size: .6875rem; }
`;

export const TouchlineFeatured = memo(function TouchlineFeatured() {
  const { data, messages, locale, update, offer } = useStableDetails();
  if (!hasMatchPredictionAccess(data)) return <Frame as="section" id="match-prediction" aria-labelledby="touchline-prediction-title" data-match-access data-match-access-required>
    <LockIcon aria-hidden="true" />
    <Access><h2 id="touchline-prediction-title">{messages.text("touchline.locked")}</h2>
      <h3>{messages.text(data.access.signedIn ? "touchline.memberTitle" : "touchline.guestTitle")}</h3>
      <p>{messages.text(data.access.signedIn ? "touchline.memberHint" : "touchline.guestHint")}
        {offer && <> {messages.text("paywall.from", { price: messages.number(offer.priceUgx), days: messages.plural("paywall.days", offer.durationDays) })}</>}</p>
      <div><ButtonLink href={subscriberHref(data.access.signedIn, data.route.path)} prefetch={false}>
        {messages.text(data.access.signedIn ? "subscribe.title" : "auth.signUp")}</ButtonLink>
        <ButtonLink variant="secondary" href={data.access.signedIn ? accountSectionHref(locale, "referrals", data.route.path) : subscriberHref(false, data.route.path, "login")} prefetch={false}>
          {messages.text(data.access.signedIn ? "referrals.invite" : "auth.signIn")}</ButtonLink></div>
    </Access><Referral data-match-referral-guidance><GiftIcon aria-hidden="true" /><strong>{messages.text("touchline.referralTitle")}</strong>
      <p>{messages.text("touchline.referralHint")}</p><small>{messages.text("touchline.completedHint")}</small></Referral>
  </Frame>;
  const family = featuredFamily(data), row = family ? marketRow(data, family) : null;
  if (!family || !row?.item) return <Verdict />;
  const item = row.item, chance = item.market.selectedProbability, price = selectedDetailPrice(data, family);
  const standing = liveStanding(data, family), outcome = data.snapshot?.applicability === "historical" ? null
    : row.outcome?.status ?? (data.snapshot?.applicability === "void" ? "void" : null);
  const notices = detailRecordNotices(data).map(key => messages.text(key));
  return <Frame as="section" id="match-prediction" aria-labelledby="touchline-prediction-title" data-featured-pick={family} data-verdict={family}>
    <Lead><ResultIcon aria-hidden="true" /><div><h2 id="touchline-prediction-title">{messages.text("touchline.featured")}</h2>
      <strong>{marketName(messages, family)} · <span><PredictionOutcome messages={messages} selection={item.market.selection} /></span></strong>
      <p data-prediction-record>{[data.snapshot ? messages.text("details.publishedAt", { time: messages.reportingInstant(data.snapshot.publishedAt) }) : messages.text("touchline.featuredHint"), ...notices].join(" · ")}</p></div></Lead>
    <Numbers><div><b>{percent(messages, chance)}</b><small>{messages.text("details.estimatedProbability")}</small><i style={{ inlineSize: `${chance * 100}%` }} /></div>
      {price !== null && <div><b>{price}</b><small>{messages.text("details.odds")}</small></div>}</Numbers>
    <Actions>{standing ? <Standing standing={standing} /> : outcome && outcome !== "pending" ? <DetailOutcome status={outcome} /> : null}
      <TouchlineLinkButton type="button" onClick={() => update(current => openDetailTab(current, "analysis"))}>
        {messages.text("touchline.why")}<ChevronRightIcon aria-hidden="true" /></TouchlineLinkButton></Actions>
  </Frame>;
});
