"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { authCopy } from "@/i18n/messages/auth";
import { useEffect, useState } from "react";
import { ThemeProvider } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { HeaderBrand } from "@/components/ui/brand";
import { ChevronLeftIcon, ChevronRightIcon, MoonIcon, ResetIcon, SunIcon } from "@/components/ui/icons";
import { darkTheme, lightTheme } from "@/styles/theme";
import { ActionButton, Badge } from "../admin-form";
import { useUserDemo } from "./demo-state";
import { userDesigns } from "./designs";
import { UserReviewWorkbench } from "./workbench";
import { Gallery, Intro, NumberStrip, Overview, OverviewCard, Preview, PreviewCanvas, PreviewNote, SampleHeading, Toolbar } from "./styles";

/** All studies reuse the real user detail, action forms and admin workspace parts. */
export function UserDesignGallery() {
  const [index, setIndex] = useState(0), [dark, setDark] = useState(false), [revision, setRevision] = useState(0);
  const demo = useUserDemo(), design = userDesigns[index]!;
  useEffect(() => {
    const sync = () => setIndex(Math.max(0, userDesigns.findIndex(item => item.id === window.location.hash.slice(1))));
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function choose(next: number) {
    const bounded = (next + userDesigns.length) % userDesigns.length;
    setIndex(bounded); window.history.replaceState(null, "", `#${userDesigns[bounded]!.id}`);
  }
  return <ThemeProvider theme={dark ? darkTheme : lightTheme}><Gallery data-user-gallery data-review-theme={dark ? "dark" : "light"}>
    <div><Intro><div><small>Goal Hint · User interface studies</small><h1>Users, with the details in reach.</h1>
      <p>Balanced compact is applied to Users. Compare the shared search, filters, account summaries and dialog actions across all ten studies.</p></div>
      <Link href="/admin/users" prefetch={false}>Open Users page</Link></Intro>
      <Toolbar aria-label="User sample controls"><FloatingField label={"Sample"}><select aria-label="User sample" value={index} onChange={event => choose(Number(event.currentTarget.value))}>
        {userDesigns.map((item, position) => <option key={item.id} value={position}>{item.id} · {item.name}</option>)}</select></FloatingField>
        <ActionButton type="button" onClick={() => { demo.reset(); setRevision(value => value + 1); }}><ResetIcon />Reset sample</ActionButton>
        <ActionButton type="button" data-spacer onClick={() => setDark(value => !value)}>{dark ? <SunIcon /> : <MoonIcon />}{dark ? "Light" : "Dark"}</ActionButton>
        <a href="#all-user-samples" onClick={event => { event.preventDefault(); document.getElementById("all-user-samples")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>All 10 samples</a>
      </Toolbar>
      <NumberStrip aria-label="Select a user sample"><ActionButton type="button" aria-label="Previous sample" onClick={() => choose(index - 1)}><ChevronLeftIcon /></ActionButton>
        {userDesigns.map((item, position) => <button key={item.id} type="button" aria-label={`${item.id} ${item.name}`} aria-current={position === index ? "true" : undefined} onClick={() => choose(position)}>{item.id}</button>)}
        <ActionButton type="button" aria-label="Next sample" onClick={() => choose(index + 1)}><ChevronRightIcon /></ActionButton></NumberStrip>
      <SampleHeading aria-live="polite"><div><h2>{design.id} · {design.name} {design.id === "01" && <Badge $tone="good">Selected · Applied</Badge>}</h2><p>{design.description}</p></div><span>Shared components · Desktop & mobile</span></SampleHeading>
      <Preview aria-label={`${design.name} user interface sample`}><header><HeaderBrand height={20} /><span>Admin / Users</span></header>
        <PreviewCanvas><UserReviewWorkbench key={`${design.id}-${revision}`} variant={design.variant} demo={demo} /></PreviewCanvas>
        <PreviewNote>{authCopy.userPreviewNote}</PreviewNote>
      </Preview>
      <Overview id="all-user-samples" aria-label="All ten user samples"><h2>Choose a direction</h2><p>Each layout keeps search and scrolling separate from the user’s details. The same forms open in dialogs.</p>
        <div>{userDesigns.map((item, position) => <OverviewCard key={item.id} type="button" data-user-design-option={item.id} aria-current={position === index ? "true" : undefined}
          onClick={() => { choose(position); document.querySelector("[data-user-gallery]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          <span>{item.id}{item.id === "01" && " · Applied"}</span><strong>{item.name}</strong><small>{item.description}</small></OverviewCard>)}</div>
      </Overview>
    </div>
  </Gallery></ThemeProvider>;
}
