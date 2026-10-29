"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "styled-components";
import { HeaderBrand } from "@/components/ui/brand";
import { ChevronLeftIcon, ChevronRightIcon, MoonIcon, ResetIcon, SunIcon } from "@/components/ui/icons";
import { darkTheme, lightTheme } from "@/styles/theme";
import { ActionButton } from "../admin-form";
import { CodesEditor } from "../code-tools";
import { codeDesigns } from "./designs";
import { samplePlans, useCodeDemo } from "./demo-state";
import { Gallery, Intro, NumberStrip, Overview, OverviewCard, Preview, PreviewCanvas, PreviewNote, SampleHeading, Toolbar } from "./styles";

const readDesign = () => Math.max(0, codeDesigns.findIndex(design => design.id === window.location.hash.slice(1)));

/** The ten compositions render the production components against an isolated in-memory transport. */
export function CodesDesignGallery() {
  const [index, setIndex] = useState(0), [dark, setDark] = useState(false);
  const [view, setView] = useState<"grant" | "details">("grant"), [revision, setRevision] = useState(0);
  const { codes, request, reset } = useCodeDemo();
  const design = codeDesigns[index]!;
  useEffect(() => {
    const sync = () => setIndex(readDesign());
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function choose(next: number) {
    const bounded = (next + codeDesigns.length) % codeDesigns.length;
    setIndex(bounded); window.history.replaceState(null, "", `#${codeDesigns[bounded]!.id}`);
  }
  function showView(next: "grant" | "details") { setView(next); setRevision(current => current + 1); }
  function resetSample() { reset(); setRevision(current => current + 1); }

  return <ThemeProvider theme={dark ? darkTheme : lightTheme}>
    <Gallery data-code-gallery data-review-theme={dark ? "dark" : "light"}>
      <div>
        <Intro>
          <div><small>Goal Hint · Admin interface studies</small><h1>Codes, with room to focus.</h1>
            <p>Ten arrangements of the same shared components. Compare the grant form and record details, then choose the sample you prefer.</p></div>
        </Intro>
        <Toolbar aria-label="Codes sample controls">
          <label>Sample<select aria-label="Codes sample" value={index} onChange={event => choose(Number(event.currentTarget.value))}>
            {codeDesigns.map((item, position) => <option key={item.id} value={position}>{item.id} · {item.name}</option>)}
          </select></label>
          <div data-view-switch aria-label="Preview view" role="group">
            <ActionButton type="button" aria-pressed={view === "grant"} onClick={() => showView("grant")}>Grant access</ActionButton>
            <ActionButton type="button" aria-pressed={view === "details"} onClick={() => showView("details")}>Record details</ActionButton>
          </div>
          <ActionButton type="button" onClick={resetSample}><ResetIcon />Reset sample</ActionButton>
          <ActionButton type="button" data-spacer onClick={() => setDark(value => !value)}>{dark ? <SunIcon /> : <MoonIcon />}{dark ? "Light" : "Dark"}</ActionButton>
          <a href="#all-samples" onClick={event => { event.preventDefault(); document.getElementById("all-samples")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>All 10 samples</a>
        </Toolbar>
        <NumberStrip aria-label="Select a Codes sample">
          <ActionButton type="button" aria-label="Previous sample" onClick={() => choose(index - 1)}><ChevronLeftIcon /></ActionButton>
          {codeDesigns.map((item, position) => <button type="button" key={item.id} aria-label={`${item.id} ${item.name}`} aria-current={position === index ? "true" : undefined} onClick={() => choose(position)}>{item.id}</button>)}
          <ActionButton type="button" aria-label="Next sample" onClick={() => choose(index + 1)}><ChevronRightIcon /></ActionButton>
        </NumberStrip>
        <SampleHeading aria-live="polite"><div><h2>{design.id} · {design.name}</h2><p>{design.description}</p></div><span>Shared components · Desktop & mobile</span></SampleHeading>
        <Preview aria-label={`${design.name} Codes interface sample`}>
          <header><HeaderBrand height={20} /><span>Admin / Codes</span></header>
          <PreviewCanvas data-code-preview={design.variant}>
            <CodesEditor key={`${design.id}-${view}-${revision}`} initialCodes={codes} plans={samplePlans} preview={{ variant: design.variant, initialView: view, request }} />
          </PreviewCanvas>
          <PreviewNote>Fictional records. Search, grant, extend and revoke operate only inside this preview. Reset restores the sample records.</PreviewNote>
        </Preview>
        <Overview id="all-samples" aria-label="All ten Codes samples"><h2>Choose a direction</h2><p>Every sample keeps the code, phone number and status in the list, with the remaining information in the details area.</p>
          <div>{codeDesigns.map((item, position) => <OverviewCard key={item.id} type="button" data-code-design-option={item.id} data-code-design-variant={item.variant} aria-current={position === index ? "true" : undefined}
            onClick={() => { choose(position); document.querySelector("[data-code-gallery]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <span>{item.id}</span><strong>{item.name}</strong><small>{item.description}</small>
          </OverviewCard>)}</div>
        </Overview>
      </div>
    </Gallery>
  </ThemeProvider>;
}
