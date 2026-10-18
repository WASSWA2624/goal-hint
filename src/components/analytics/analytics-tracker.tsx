"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { analyticsRules } from "@/domain/analytics-settings";
import { informationHref } from "@/domain/navigation-paths";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { media } from "@/styles/theme";
import { getConsentState, getServerConsentState, rememberLanding, setConsent, startTracker, stopTracker, subscribeConsent,
  trackPageview, trackSearch } from "./tracker";

export function useConsentState() {
  return useSyncExternalStore(subscribeConsent, getConsentState, getServerConsentState);
}

/** Root-level page-view tracking plus the first-visit consent banner. The dashboard itself is never tracked. */
export function AnalyticsTracker({ available }: { available: boolean }) {
  const pathname = usePathname();
  const query = useSearchParams().get("q") ?? "";
  const consent = useConsentState();
  const excluded = pathname.startsWith(analyticsRules.dashboardPath);
  const last = useRef<string | null>(null);

  useEffect(() => { rememberLanding(); }, []);
  useEffect(() => {
    if (!available || consent !== "granted" || excluded) return;
    startTracker();
    return () => { stopTracker(); last.current = null; };
  }, [available, consent, excluded]);
  useEffect(() => {
    if (!available || consent !== "granted" || excluded) return;
    // A short timer (not animation frames, which background tabs pause) lets the route's title settle.
    const timer = setTimeout(() => {
      if (last.current !== pathname) { last.current = pathname; trackPageview(pathname, document.title); }
      if (query) trackSearch(query);
    }, 50);
    return () => clearTimeout(timer);
  }, [available, consent, excluded, pathname, query]);

  if ((consent !== "unset" && consent !== "pending") || excluded || !available) return null;
  return <ServerThemeUntilHydrated><ConsentBanner pending={consent === "pending"} /></ServerThemeUntilHydrated>;
}

function ConsentBanner({ pending }: { pending: boolean }) {
  return (
    <Banner role="region" aria-labelledby="analytics-consent-title" data-analytics-ignore="" data-consent-pending={pending ? "" : undefined}>
      <Title id="analytics-consent-title">Help us improve Goal Hint</Title>
      <Text>
        With your permission we count page views, time on page, device type and approximate region in our own
        database to see what is useful. No advertising, no third parties, no cross-site tracking.{" "}
        <a href={`${informationHref("privacy")}#privacy-tracking`}>Privacy details</a>
      </Text>
      <Choices>
        <Button variant="secondary" disabled={pending} onClick={() => setConsent("denied")}>Decline</Button>
        <Button disabled={pending} onClick={() => setConsent("granted")}>Allow analytics</Button>
      </Choices>
    </Banner>
  );
}

/** Privacy-page control for changing the choice at any time. */
export function AnalyticsChoices() {
  const consent = useConsentState();
  const status = consent === "granted" ? "Allowed. Page views and interactions from this browser are counted."
    : consent === "denied" ? "Declined. Nothing from this browser is recorded."
    : consent === "signal" ? "Off. Your browser sends a Global Privacy Control or Do Not Track signal, which Goal Hint honours."
    : consent === "automation" ? "Off for automated browsers."
    : consent === "pending" ? "Checking this browser's choice…" : "Not chosen yet. Nothing is recorded until you allow it.";
  return (
    <ChoicePanel data-analytics-ignore="" aria-live="polite">
      <strong>Your analytics choice</strong>
      <span>{status}</span>
      {(consent === "granted" || consent === "denied" || consent === "unset") && <Choices>
        <Button variant="secondary" disabled={consent === "denied"} onClick={() => setConsent("denied")}>
          {consent === "granted" ? "Withdraw consent" : "Decline"}
        </Button>
        <Button disabled={consent === "granted"} onClick={() => setConsent("granted")}>Allow analytics</Button>
      </Choices>}
    </ChoicePanel>
  );
}

const Banner = styled.section`
  position: fixed;
  z-index: 30;
  inset-inline: 8px;
  inset-block-end: calc(3.5rem + 9px + env(safe-area-inset-bottom));
  display: grid;
  gap: 10px;
  max-inline-size: 30rem;
  margin-inline: auto;
  padding: 14px 16px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  box-shadow: 0 12px 32px rgb(16 42 58 / 0.28);
  ${media.desktop} {
    inset-inline: auto 24px;
    inset-block-end: 24px;
  }
`;
const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  ${media.desktop} { font-size: 1rem; }
`;
const Text = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1.5;
  ${media.desktop} { font-size: ${({ theme }) => theme.typography.size.small}; }
`;
const Choices = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;
const ChoicePanel = styled.div`
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${Choices} { max-inline-size: 24rem; }
`;
