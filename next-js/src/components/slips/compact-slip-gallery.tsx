"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { lightTheme, darkTheme } from "@/styles/theme";
import { CompactSlip } from "./compact-slip/compact-slip";
import { compactSlipDesigns, type CompactSlipVariant } from "./compact-slip/designs";
import { compactSlipPreview, compactSlipScenarios, type CompactSlipScenario } from "./compact-slip-preview-data";

const Review = styled.main`
  min-block-size: 100vh; padding: var(--gh-spacing-7) clamp(var(--gh-spacing-3), 3vw, var(--gh-spacing-12)) var(--gh-spacing-12);
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: var(--gh-font-emphasis);
  h1 { font-size: clamp(var(--gh-font-headline), 4vw, var(--gh-font-displayLarge)); line-height: var(--gh-leading-control); letter-spacing: var(--gh-tracking-tightest); }
  button, select { font: inherit; }
  button, select, a { outline-offset: var(--gh-size-0_75); }
  button:focus-visible, select:focus-visible, a:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; }
`;
const Intro = styled.header`
  display: grid; gap: var(--gh-spacing-2_5); max-inline-size: var(--gh-size-312); margin-inline: auto;
  > p { color: ${({ theme }) => theme.color.mutedText}; max-inline-size: var(--gh-size-192); line-height: var(--gh-leading-body); }
  > [data-eyebrow] { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-heavy); letter-spacing: var(--gh-tracking-display); text-transform: uppercase; color: ${({ theme }) => theme.color.link}; }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: var(--gh-spacing-3); padding: var(--gh-spacing-4_5) 0;
  > label, > fieldset { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; }
  > label > span, legend { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-bold); color: ${({ theme }) => theme.color.mutedText}; }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { margin-block-end: var(--gh-spacing-1_25); }
  fieldset > div { display: flex; }
  button, select {
    min-block-size: var(--gh-size-11); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; cursor: pointer;
  }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  @media (max-width: ${({ theme }) => theme.viewport[28]}) { > label { flex: 1 1 42%; } select { inline-size: 100%; } }
`;
const Gallery = styled.div<{ $focused: boolean }>`
  display: grid; grid-template-columns: ${({ $focused }) => $focused ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(min(100%, var(--gh-size-92)), 1fr))"};
  gap: var(--gh-spacing-6); max-inline-size: ${({ $focused }) => $focused ? "var(--gh-size-160)" : "var(--gh-size-400)"}; margin: var(--gh-spacing-3_5) auto 0; align-items: start;
`;
const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: var(--gh-spacing-3);
  > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--gh-spacing-2_5); align-items: start; margin-block-end: var(--gh-spacing-3); }
  h2 { font-size: var(--gh-font-section); line-height: var(--gh-leading-compact); font-weight: var(--gh-weight-heavy); }
  header p { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); margin-block-start: var(--gh-spacing-0_75); }
  [data-option-number] { font-size: var(--gh-font-title); color: ${({ theme }) => theme.color.link}; font-weight: var(--gh-weight-heavy); line-height: var(--gh-leading-label); }
  header button { min-inline-size: var(--gh-size-11); min-block-size: var(--gh-size-11); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.link}; padding: var(--gh-spacing-1_5) var(--gh-spacing-2_25); font-size: var(--gh-font-secondary); cursor: pointer; }
`;
const Phone = styled.div<{ $width: number }>`
  inline-size: 100%; max-inline-size: ${({ $width }) => $width}px; margin-inline: auto;
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surfaceMuted};
  container-type: inline-size;
`;
const Context = styled.div`
  padding: var(--gh-spacing-2_5); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2);
  background: ${({ theme }) => theme.color.surface};
  > strong { font-size: var(--gh-font-body); }
  > span { font-size: var(--gh-font-micro); color: ${({ theme }) => theme.color.mutedText}; text-transform: uppercase; letter-spacing: var(--gh-tracking-wider); }
`;
const Samples = styled.div`
  display: grid; gap: var(--gh-spacing-2); padding: var(--gh-spacing-2);
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); font-weight: var(--gh-weight-bold); text-transform: uppercase; letter-spacing: var(--gh-tracking-uppercase); }
  > p:not(:first-child) { margin-block-start: var(--gh-spacing-1_5); }
`;
const Footer = styled.p`
  max-inline-size: var(--gh-size-312); margin: var(--gh-spacing-7) auto 0; padding-block-start: var(--gh-spacing-4); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-prose);
  a { color: ${({ theme }) => theme.color.link}; }
`;

/** Review-only gallery: the same slip component serves both sample contexts. */
export function CompactSlipGallery({ locale }: { locale: string }) {
  const [scenario, setScenario] = useState<CompactSlipScenario>("standard");
  const [context, setContext] = useState<"best" | "builder">("best");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(375);
  const [focused, setFocused] = useState<CompactSlipVariant | "all">("all");
  const sample = compactSlipPreview(scenario);
  const options = focused === "all" ? compactSlipDesigns : compactSlipDesigns.filter((design) => design.id === focused);
  return <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>
    <Review data-compact-slip-gallery>
      <Intro>
        <p data-eyebrow>Goal Hint · Mobile design review</p>
        <h1>Less scrolling. Every selection.</h1>
        <p>Ten compact slip designs for Best slips and the slip builder. Compare the same sample in collapsed and expanded states. Tap any slip header to open or close it.</p>
        <Toolbar aria-label="Design preview controls">
          <fieldset><legend>Display context</legend><div>
            <button type="button" aria-pressed={context === "best"} onClick={() => setContext("best")}>Best slips</button>
            <button type="button" aria-pressed={context === "builder"} onClick={() => setContext("builder")}>Slip builder</button>
          </div></fieldset>
          <FloatingField label={<><span>Design</span></>}><select value={focused} onChange={(event) => setFocused(event.target.value as CompactSlipVariant | "all")}>
            <option value="all">Compare all 10</option>
            {compactSlipDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
          </select></FloatingField>
          <FloatingField label={<><span>Sample</span></>}><select value={scenario} onChange={(event) => setScenario(event.target.value as CompactSlipScenario)}>
            {compactSlipScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></FloatingField>
          <FloatingField label={<><span>Preview width</span></>}><select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {[320, 375, 430].map((value) => <option key={value} value={value}>Up to {value}px</option>)}
          </select></FloatingField>
          <fieldset><legend>Appearance</legend><div>
            <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>Light</button>
            <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>Dark</button>
          </div></fieldset>
        </Toolbar>
      </Intro>
      <Gallery $focused={focused !== "all"}>
        {options.map((design) => {
          const number = compactSlipDesigns.findIndex((item) => item.id === design.id) + 1;
          return <Option key={design.id} id={design.id} aria-labelledby={`design-${design.id}`} data-design-option={design.id}>
            <header>
              <span data-option-number aria-hidden="true">{String(number).padStart(2, "0")}</span>
              <div><h2 id={`design-${design.id}`}>{design.name}</h2><p>{design.description}</p></div>
              <button type="button" onClick={() => setFocused(focused === "all" ? design.id : "all")} aria-label={focused === "all" ? `Inspect ${design.name}` : "Compare all 10 designs"}>
                {focused === "all" ? "Inspect" : "All 10"}
              </button>
            </header>
            <Phone $width={width} data-preview-phone>
              <Context><strong>{context === "best" ? "Best slips" : "Slip builder"}</strong><span>Sample · {sample.slip.selections.length} selections</span></Context>
              <Samples key={`${scenario}-${context}-${design.id}`}>
                <p>Collapsed</p>
                <CompactSlip {...sample} locale={locale} variant={design.id} index={context === "best" ? 0 : 3} analysisLinks={false} />
                <p>Expanded</p>
                <CompactSlip {...sample} locale={locale} variant={design.id} index={context === "best" ? 0 : 3} analysisLinks={false} initiallyOpen />
              </Samples>
            </Phone>
          </Option>;
        })}
      </Gallery>
      <Footer>Illustrative data for layout review; these are sample fixtures and picks. All designs show total odds, average match probability and selection count. Average match probability is the mean of the individual selections, not the chance that every selection wins. Design 01, Inline ledger, is used for Best slips and the slip builder. <a href={`/${locale}/slips/designs/desktop`}>Compare desktop samples</a>.</Footer>
    </Review>
  </ThemeProvider>;
}
