"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { lightTheme, darkTheme } from "@/styles/theme";
import { CompactSlip } from "./compact-slip/compact-slip";
import { compactSlipDesigns, type CompactSlipVariant } from "./compact-slip/designs";
import { compactSlipPreview, compactSlipScenarios, type CompactSlipScenario } from "./compact-slip-preview-data";

const Review = styled.main`
  min-block-size: 100vh; padding: 28px clamp(12px, 3vw, 48px) 48px;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: 0.875rem;
  h1 { font-size: clamp(1.5rem, 4vw, 2.25rem); line-height: 1.2; letter-spacing: -0.04em; }
  button, select { font: inherit; border-radius: 0; }
  button, select, a { outline-offset: 3px; }
  button:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; }
`;
const Intro = styled.header`
  display: grid; gap: 10px; max-inline-size: 78rem; margin-inline: auto;
  > p { color: ${({ theme }) => theme.color.mutedText}; max-inline-size: 48rem; line-height: 1.6; }
  > [data-eyebrow] { font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: ${({ theme }) => theme.color.link}; }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: 12px; padding: 18px 0;
  > label, > fieldset { display: grid; gap: 5px; min-inline-size: 0; }
  > label > span, legend { font-size: 0.6875rem; font-weight: 700; color: ${({ theme }) => theme.color.mutedText}; }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { margin-block-end: 5px; }
  fieldset > div { display: flex; }
  button, select {
    min-block-size: 44px; padding: 8px 10px; border: 1px solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; cursor: pointer;
  }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  @media (max-width: 28rem) { > label { flex: 1 1 42%; } select { inline-size: 100%; } }
`;
const Gallery = styled.div<{ $focused: boolean }>`
  display: grid; grid-template-columns: ${({ $focused }) => $focused ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(min(100%, 23rem), 1fr))"};
  gap: 24px; max-inline-size: ${({ $focused }) => $focused ? "40rem" : "100rem"}; margin: 14px auto 0; align-items: start;
`;
const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: 12px;
  > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; margin-block-end: 12px; }
  h2 { font-size: 1rem; line-height: 1.4; font-weight: 800; }
  header p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5; margin-block-start: 3px; }
  [data-option-number] { font-size: 1.125rem; color: ${({ theme }) => theme.color.link}; font-weight: 800; line-height: 1.3; }
  header button { min-inline-size: 44px; min-block-size: 44px; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.link}; padding: 6px 9px; font-size: 0.75rem; cursor: pointer; }
`;
const Phone = styled.div<{ $width: number }>`
  inline-size: 100%; max-inline-size: ${({ $width }) => $width}px; margin-inline: auto;
  border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surfaceMuted};
  container-type: inline-size;
`;
const Context = styled.div`
  padding: 10px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: ${({ theme }) => theme.color.surface};
  > strong { font-size: 0.8125rem; }
  > span { font-size: 0.625rem; color: ${({ theme }) => theme.color.mutedText}; text-transform: uppercase; letter-spacing: 0.04em; }
`;
const Samples = styled.div`
  display: grid; gap: 8px; padding: 8px;
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  > p:not(:first-child) { margin-block-start: 6px; }
`;
const Footer = styled.p`
  max-inline-size: 78rem; margin: 28px auto 0; padding-block-start: 16px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.7;
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
          <label><span>Design</span><select value={focused} onChange={(event) => setFocused(event.target.value as CompactSlipVariant | "all")}>
            <option value="all">Compare all 10</option>
            {compactSlipDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
          </select></label>
          <label><span>Sample</span><select value={scenario} onChange={(event) => setScenario(event.target.value as CompactSlipScenario)}>
            {compactSlipScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label><span>Preview width</span><select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {[320, 375, 430].map((value) => <option key={value} value={value}>Up to {value}px</option>)}
          </select></label>
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
