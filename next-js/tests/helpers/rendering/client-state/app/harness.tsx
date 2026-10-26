"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/controls";
import { BodyText, Container, PageHeading, PageMain, Stack, Surface } from "@/components/ui/layout";
import { FeedStateProvider } from "@/state/provider";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { draftChanged } from "@/state/feed";
import { preferencesChanged } from "@/state/preferences";
import type { FeedBootstrap } from "@/state/contracts";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function Probe({ id }: { id: string }) {
  const feed = useAppSelector((state) => state.feed);
  const density = useAppSelector((state) => state.preferences.density);
  const dispatch = useAppDispatch();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <Surface id={id} data-hydrated={String(hydrated)}><Stack>
    <BodyText id={id + "-query"}>{feed.query.search}</BodyText>
    <BodyText id={id + "-draft"}>{feed.draft.search}</BodyText>
    <BodyText id={id + "-version"}>{feed.records["fixture-a"]?.dataVersion}</BodyText>
    <BodyText id={id + "-density"}>{density}</BodyText>
    <Button id={id + "-change"} onClick={() => dispatch(draftChanged({ ...feed.draft, search: "changed" }))}>Change {id} draft</Button>
    <Button id={id + "-compact"} onClick={() => dispatch(preferencesChanged({ density: "compact" }))}>Compact {id}</Button>
  </Stack></Surface>;
}
export function Harness({ initial }: { initial: FeedBootstrap }) {
  const [renders, setRenders] = useState(0);
  const changedSeed = { ...initial, query: { ...initial.query, search: "reseeded" } };
  return <PageMain><Container><Stack>
    <PageHeading>Client state acceptance fixture</PageHeading>
    <BodyText>Synthetic fixture data for isolated state verification.</BodyText>
    <Button id="rerender" onClick={() => setRenders(renders + 1)}>Render parent again</Button>
    <FeedStateProvider initial={renders ? changedSeed : initial}><Probe id="a" /></FeedStateProvider>
    <FeedStateProvider initial={{ ...initial, query: { ...initial.query, search: initial.query.search + "-b" } }}><Probe id="b" /></FeedStateProvider>
  </Stack></Container></PageMain>;
}
