"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { darkTheme, lightTheme } from "@/styles/theme";
import { mobileSlipHeaderDesigns, type MobileSlipHeaderVariant } from "./mobile-slip-header-review/designs";
import { MobileSlipHeaderSample } from "./mobile-slip-header-review/mobile-slip-header-sample";
import { mobileHeaderPreview, mobileHeaderScenarios, type MobileHeaderScenario } from "./mobile-slip-header-review/preview-data";

const Review = styled.main`
  min-block-size: 100vh; padding: var(--gh-spacing-6) clamp(var(--gh-spacing-2_5), 3vw, var(--gh-spacing-10)) var(--gh-spacing-10);
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page}; font-size: var(--gh-font-emphasis);
  button, select { font: inherit; }
  button, select, a { outline-offset: var(--gh-size-0_75); }
  button:focus-visible, select:focus-visible, a:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; }
  @media (max-width: ${({ theme }) => theme.viewport[22]}) { padding-inline: var(--gh-spacing-1_5); }
`;
const Intro = styled.header`
  display: grid; gap: var(--gh-spacing-2); max-inline-size: var(--gh-size-400); margin-inline: auto;
  > [data-eyebrow] { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-heavy); letter-spacing: var(--gh-tracking-display); text-transform: uppercase; }
  h1 { font-size: clamp(var(--gh-font-headline), 4vw, var(--gh-font-displayLarge)); line-height: var(--gh-leading-control); letter-spacing: var(--gh-tracking-tightest); }
  > p { max-inline-size: var(--gh-size-192); color: ${({ theme }) => theme.color.mutedText}; line-height: var(--gh-leading-body); }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: var(--gh-spacing-3); padding-block: var(--gh-spacing-3_5);
  > label, > fieldset { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; }
  > label > span, legend { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-bold); }
  fieldset { margin: 0; padding: 0; border: 0; }
  legend { margin-block-end: var(--gh-spacing-1_25); }
  fieldset > div { display: flex; }
  button, select {
    min-block-size: var(--gh-size-11); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder};
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; cursor: pointer;
  }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] { border-color: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; }
  @media (max-width: ${({ theme }) => theme.viewport[30]}) { > label { flex: 1 1 43%; } select { inline-size: 100%; max-inline-size: 100%; } }
`;
const Gallery = styled.div<{ $focused: boolean; $width: number }>`
  display: grid; align-items: start; gap: var(--gh-spacing-7) var(--gh-spacing-6);
  grid-template-columns: ${({ $focused, $width }) => $focused ? "minmax(0, 1fr)" : `repeat(auto-fit, minmax(min(100%, ${$width}px), 1fr))`};
  max-inline-size: ${({ $focused, $width }) => $focused ? `${Math.max($width, 375)}px` : "var(--gh-size-400)"}; margin: var(--gh-spacing-4) auto 0;
`;
const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: var(--gh-spacing-3);
  > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--gh-spacing-2_25); margin-block-end: var(--gh-spacing-2_5); }
  [data-option-number] { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-title); font-weight: var(--gh-weight-heavy); line-height: var(--gh-leading-label); }
  h2 { font-size: var(--gh-font-section); font-weight: var(--gh-weight-heavy); line-height: var(--gh-leading-compact); }
  header p { margin-block-start: var(--gh-spacing-0_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); }
  header button {
    min-inline-size: var(--gh-size-11); min-block-size: var(--gh-size-11); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_25); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.surface}; font-size: var(--gh-font-secondary); cursor: pointer;
  }
`;
const Phone = styled.div<{ $width: number }>`
  inline-size: 100%; max-inline-size: ${({ $width }) => $width}px; margin-inline: auto;
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surfaceMuted}; container-type: inline-size;
`;
const Context = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-2);
  padding: var(--gh-spacing-2); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > strong { font-size: var(--gh-font-body); }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); }
`;
const Samples = styled.div`
  display: grid; gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-1_5);
  > div { min-inline-size: 0; display: grid; gap: var(--gh-spacing-1_25); }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); font-weight: var(--gh-weight-bold); letter-spacing: var(--gh-tracking-uppercase); text-transform: uppercase; }
  @media (max-width: ${({ theme }) => theme.viewport[22]}) { padding-inline: var(--gh-spacing-0_25); }
`;
const Footer = styled.p`
  max-inline-size: var(--gh-size-400); margin: var(--gh-spacing-7) auto 0; padding-block-start: var(--gh-spacing-4); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-prose);
  a { color: ${({ theme }) => theme.color.link}; }
`;

const outcomes = ["won", "lost", "pending"] as const;

/** A dedicated comparison surface keeps the approved match rows identical in every header candidate. */
export function MobileSlipHeaderGallery({ locale }: { locale: string }) {
  const [scenario, setScenario] = useState<MobileHeaderScenario>(mobileHeaderScenarios[0]!.id);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(375);
  const [focused, setFocused] = useState<MobileSlipHeaderVariant | "all">("all");
  const sample = mobileHeaderPreview(scenario);
  const options = focused === "all" ? mobileSlipHeaderDesigns : mobileSlipHeaderDesigns.filter((design) => design.id === focused);
  const otherOutcomes = outcomes.filter((outcome) => outcome !== sample.outcome);

  return <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>
    <Review data-mobile-header-gallery data-appearance={mode}>
      <Intro>
        <p data-eyebrow>Goal Hint · Mobile header review</p>
        <h1>Ten tighter Vertical rules headers.</h1>
        <p>09 Minimal rules is now the mobile header, with a little more horizontal padding around its text. Compare Slip, Odds, Probability, Matches and Status on one row in 28–34px headers. Fixed columns keep the separators aligned, and every status uses the same width. Expanded examples use the unchanged Clean ledger match rows. Tap a slip header to open or close it.</p>
        <Toolbar aria-label="Mobile header preview controls">
          <FloatingField label={<><span>Design</span></>}><select value={focused} onChange={(event) => setFocused(event.target.value as MobileSlipHeaderVariant | "all")}>
            <option value="all">Compare all 10</option>
            {mobileSlipHeaderDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
          </select></FloatingField>
          <FloatingField label={<><span>Sample</span></>}><select value={scenario} onChange={(event) => setScenario(event.target.value as MobileHeaderScenario)}>
            {mobileHeaderScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
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
      <Gallery $focused={focused !== "all"} $width={width}>
        {options.map((design) => {
          const number = mobileSlipHeaderDesigns.findIndex((item) => item.id === design.id) + 1;
          return <Option key={design.id} id={design.id} aria-labelledby={`header-design-${design.id}`} data-header-option={design.id}>
            <header>
              <span data-option-number aria-hidden="true">{String(number).padStart(2, "0")}</span>
              <div><h2 id={`header-design-${design.id}`}>{design.name}</h2><p>{design.description}</p></div>
              <button type="button" onClick={() => setFocused(focused === "all" ? design.id : "all")} aria-label={focused === "all" ? `Inspect ${design.name}` : "Compare all 10 designs"}>
                {focused === "all" ? "Inspect" : "All 10"}
              </button>
            </header>
            <Phone $width={width} data-preview-phone data-preview-width={width} data-header-alignment-group>
              <Context><strong>Header sample</strong><span>Match rows unchanged · {sample.slip.selections.length} matches</span></Context>
              <Samples key={`${scenario}-${design.id}`}>
                <div data-collapsed-sample><p>Collapsed</p><MobileSlipHeaderSample {...sample} locale={locale} variant={design.id} /></div>
                <div data-status-samples><p>Other statuses</p>{otherOutcomes.map((outcome) =>
                  <MobileSlipHeaderSample key={outcome} {...sample} locale={locale} variant={design.id} outcome={outcome} headerOnly />)}</div>
                <div data-expanded-sample><p>Expanded · matches unchanged</p><MobileSlipHeaderSample {...sample} locale={locale} variant={design.id} initiallyOpen /></div>
              </Samples>
            </Phone>
          </Option>;
        })}
      </Gallery>
      <Footer>Illustrative fixtures, generic crests and predictions for layout review. 09 Minimal rules is applied to mobile slips. Probability remains the mean of the individual match probabilities; its calculation is unchanged. <a href={`/${locale}/slips/designs`}>View the approved match layout</a> · <a href={`/${locale}/slips/designs/desktop`}>Desktop samples</a>.</Footer>
    </Review>
  </ThemeProvider>;
}
