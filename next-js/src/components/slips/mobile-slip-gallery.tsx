"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { darkTheme, lightTheme } from "@/styles/theme";
import { compactSlipScenarios, type CompactSlipScenario } from "./compact-slip-preview-data";
import { mobileSlipDesigns, type MobileSlipVariant } from "./mobile-slip-review/designs";
import { MobileSlipSample } from "./mobile-slip-review/mobile-slip-sample";
import { mobileSlipPreview } from "./mobile-slip-review/preview-data";

const Review = styled.main`
  min-block-size: 100vh;
  padding: 24px clamp(10px, 3vw, 40px) 40px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.page};
  font-size: 0.875rem;
  button, select { font: inherit; border-radius: 0; }
  button, select, a { outline-offset: 3px; }
  button:focus-visible, select:focus-visible, a:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.focus};
  }
`;

const Intro = styled.header`
  display: grid;
  gap: 8px;
  max-inline-size: 100rem;
  margin-inline: auto;
  > [data-eyebrow] {
    color: ${({ theme }) => theme.color.link};
    font-size: 0.6875rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 { font-size: clamp(1.5rem, 4vw, 2.25rem); line-height: 1.2; letter-spacing: -0.04em; }
  > p { max-inline-size: 48rem; color: ${({ theme }) => theme.color.mutedText}; line-height: 1.6; }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  padding-block: 14px;
  > label, > fieldset { display: grid; gap: 5px; min-inline-size: 0; }
  > label > span, legend { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: 700; }
  fieldset { margin: 0; padding: 0; border: 0; }
  legend { margin-block-end: 5px; }
  fieldset > div { display: flex; }
  button, select {
    min-block-size: 44px;
    padding: 8px 10px;
    border: 1px solid ${({ theme }) => theme.color.controlBorder};
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    cursor: pointer;
  }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] {
    border-color: ${({ theme }) => theme.color.brand};
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
  }
  @media (max-width: 30rem) {
    > label { flex: 1 1 43%; }
    select { inline-size: 100%; max-inline-size: 100%; }
  }
`;

const Gallery = styled.div<{ $focused: boolean; $width: number }>`
  display: grid;
  grid-template-columns: ${({ $focused, $width }) => $focused
    ? "minmax(0, 1fr)"
    : `repeat(auto-fit, minmax(min(100%, ${$width}px), 1fr))`};
  align-items: start;
  gap: 28px 24px;
  max-inline-size: ${({ $focused, $width }) => $focused ? `${Math.max($width, 375)}px` : "100rem"};
  margin: 16px auto 0;
`;

const Option = styled.section`
  min-inline-size: 0;
  scroll-margin-block-start: 12px;
  > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 9px; margin-block-end: 10px; }
  [data-option-number] { color: ${({ theme }) => theme.color.link}; font-size: 1.125rem; font-weight: 800; line-height: 1.3; }
  h2 { font-size: 1rem; font-weight: 800; line-height: 1.4; }
  header p { margin-block-start: 3px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5; }
  header button {
    min-inline-size: 44px;
    min-block-size: 44px;
    padding: 6px 9px;
    border: 1px solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.link};
    background: ${({ theme }) => theme.color.surface};
    font-size: 0.75rem;
    cursor: pointer;
  }
`;

const Phone = styled.div<{ $width: number }>`
  inline-size: 100%;
  max-inline-size: ${({ $width }) => $width}px;
  margin-inline: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surfaceMuted};
  container-type: inline-size;
`;

const Context = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  padding: 8px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
  > strong { font-size: 0.8125rem; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; }
`;

const Samples = styled.div`
  display: grid;
  gap: 10px;
  padding: 6px;
  > div { min-inline-size: 0; display: grid; gap: 5px; }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
`;

const Footer = styled.p`
  max-inline-size: 100rem;
  margin: 28px auto 0;
  padding-block-start: 16px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.7;
  a { color: ${({ theme }) => theme.color.link}; }
`;

/** Compare identical illustrative slips without applying a design to the live match feeds. */
export function MobileSlipGallery({ locale }: { locale: string }) {
  const [scenario, setScenario] = useState<CompactSlipScenario>("standard");
  const [context, setContext] = useState<"best" | "builder">("best");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(375);
  const [focused, setFocused] = useState<MobileSlipVariant | "all">("all");
  const sample = mobileSlipPreview(scenario);
  const options = focused === "all" ? mobileSlipDesigns : mobileSlipDesigns.filter((design) => design.id === focused);

  return <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>
    <Review data-mobile-slip-gallery data-appearance={mode}>
      <Intro>
        <p data-eyebrow>Goal Hint · Mobile design review</p>
        <h1>Compact slips. Ten ways.</h1>
        <p>Compare the same slip in ten compact layouts. Date and time lead the top row, with league and country on the right. Team names and text-height logos sit above the market, pick, odds and probability.</p>
        <Toolbar aria-label="Mobile design preview controls">
          <fieldset><legend>Display context</legend><div>
            <button type="button" aria-pressed={context === "best"} onClick={() => setContext("best")}>Best slips</button>
            <button type="button" aria-pressed={context === "builder"} onClick={() => setContext("builder")}>Slip builder</button>
          </div></fieldset>
          <label><span>Design</span><select value={focused} onChange={(event) => setFocused(event.target.value as MobileSlipVariant | "all")}>
            <option value="all">Compare all 10</option>
            {mobileSlipDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
          </select></label>
          <label><span>Sample</span><select value={scenario} onChange={(event) => setScenario(event.target.value as CompactSlipScenario)}>
            {compactSlipScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label><span>Preview width</span><select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {[320, 375, 430, 768].map((value) => <option key={value} value={value}>{value}px {value === 768 ? "tablet" : "phone"}</option>)}
          </select></label>
          <fieldset><legend>Appearance</legend><div>
            <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>Light</button>
            <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>Dark</button>
          </div></fieldset>
        </Toolbar>
      </Intro>
      <Gallery $focused={focused !== "all"} $width={width}>
        {options.map((design) => {
          const number = mobileSlipDesigns.findIndex((item) => item.id === design.id) + 1;
          return <Option key={design.id} id={design.id} aria-labelledby={`mobile-design-${design.id}`} data-design-option={design.id}>
            <header>
              <span data-option-number aria-hidden="true">{String(number).padStart(2, "0")}</span>
              <div><h2 id={`mobile-design-${design.id}`}>{design.name}</h2><p>{design.description}</p></div>
              <button type="button" onClick={() => setFocused(focused === "all" ? design.id : "all")} aria-label={focused === "all" ? `Inspect ${design.name}` : "Compare all 10 designs"}>
                {focused === "all" ? "Inspect" : "All 10"}
              </button>
            </header>
            <Phone $width={width} data-preview-phone data-preview-width={width}>
              <Context><strong>{context === "best" ? "Best slips" : "Slip builder"}</strong><span>Sample · {sample.slip.selections.length} selections</span></Context>
              <Samples key={`${scenario}-${context}-${design.id}`}>
                <div data-collapsed-sample><p>Collapsed</p><MobileSlipSample {...sample} locale={locale} variant={design.id} index={context === "best" ? 0 : 3} /></div>
                <div data-expanded-sample><p>Expanded</p><MobileSlipSample {...sample} locale={locale} variant={design.id} index={context === "best" ? 0 : 3} initiallyOpen /></div>
              </Samples>
            </Phone>
          </Option>;
        })}
      </Gallery>
      <Footer>Illustrative fixtures, generic crests and predictions for design review. All ten use dates such as 28-Oct, EAT time with AM/PM, VS and compact prediction labels. Tap a slip header to open or close it. Average probability is the mean of the individual picks. Choose a design before it is applied across matches and slips. <a href={`/${locale}/slips/designs/desktop`}>Compare desktop samples</a>.</Footer>
    </Review>
  </ThemeProvider>;
}
