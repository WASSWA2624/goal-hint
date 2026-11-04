"use client";

import { authCopy } from "@/i18n/messages/auth";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { HeaderBrand } from "@/components/ui/brand";
import { Button } from "@/components/ui/controls";
import { Container, Inline, PageHeading, PageMain, Stack, Surface } from "@/components/ui/layout";
import { Header, HeaderContent } from "@/components/navigation/shell-styles";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { offlineFixture, offlineRules, offlineSnapshotSchema, type OfflineSnapshot } from "@/domain/offline";
import { OfflineUpdateNotice } from "./offline-update-notice";

const Notice = Surface;
const Heading = styled(HeaderContent)`justify-content: space-between; gap: var(--gh-spacing-3);`;
const Link = styled.a`color: inherit; text-underline-offset: var(--gh-size-0_75);`;

/** A shared, read-only web view: no account state, forecasts, remote media, or queued actions. */
export function OfflineView() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    let disposed = false;
    const path = location.pathname;
    const cachedRoute = ["/", "/en", "/en/", "/en/matches", "/en/matches/", "/offline"].includes(path) && !location.search;
    let abort: AbortController | undefined;
    const read = () => {
      abort?.abort();
      const request = new AbortController();
      abort = request;
      const timer = setTimeout(() => request.abort(), 8_000);
      void fetch("/offline-cache/snapshot", { cache: "no-store", credentials: "omit", signal: request.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = offlineSnapshotSchema.safeParse(await response.json());
        if (!disposed && !request.signal.aborted && parsed.success && parsed.data.expiresAt > Date.now()
          && parsed.data.capturedAt <= Date.now() + offlineRules.clockSkewMs) setSnapshot(parsed.data);
      }).catch(() => { /* Denied, missing or corrupt storage gets the same honest recovery state. */ })
      .finally(() => { clearTimeout(timer); if (!disposed) { setSupported(cachedRoute); setLoading(false); } });
    };
    read();
    window.addEventListener("goal-hint-offline-ready", read);
    return () => { disposed = true; abort?.abort(); window.removeEventListener("goal-hint-offline-ready", read); };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const expire = () => { if (snapshot.expiresAt <= Date.now()) setSnapshot(null); };
    const timer = setTimeout(expire, Math.max(0, snapshot.expiresAt - Date.now()));
    document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", expire); };
  }, [snapshot]);
  const saved = snapshot && supported;
  return <div data-offline-view data-offline-state={loading ? "loading" : saved ? "saved" : "unavailable"}>
    <Header><Heading $wide><HeaderBrand /><span>Saved view</span></Heading><NavigationProgress label="Loading saved view" /></Header>
    <PageMain id="main-content" $app $compact aria-busy={loading}><Container $wide><Stack>
      <PageHeading>{supported ? "Saved matches" : "This page needs a connection"}</PageHeading>
      <Notice aria-live="polite"><Stack $gap="sm">
        {loading ? null : saved ? <>
          <p>Showing an anonymous saved view. Scores and match status may have changed.</p>
          <p>Saved <time data-offline-saved-at dateTime={new Date(snapshot.capturedAt).toISOString()}>{new Date(snapshot.capturedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} EAT</time>.</p>
        </> : <p>{supported ? "No usable saved matches are available. Connect to the internet and try again." : "This route was not saved. Open saved matches or reconnect to use it."}</p>}
        <p>{authCopy.offlineConnection}</p>
        <OfflineUpdateNotice />
        <Inline><Button variant="secondary" onClick={() => location.reload()}>Try online again</Button>
          {!supported && <Link href="/en/matches">Open saved matches</Link>}</Inline>
      </Stack></Notice>
      {saved && <>
        {snapshot.records.length ? <MatchCardList aria-label="Saved matches" rowNumberMaximum={snapshot.records.length}>
          {snapshot.records.map((record, index) => <li key={record.fixtureId}><MatchCard fixture={offlineFixture(record)} analysisSlug="saved" position={index + 1} offline /></li>)}
        </MatchCardList> : <p>No matches were available when this view was saved.</p>}
      </>}
    </Stack></Container></PageMain>
  </div>;
}
