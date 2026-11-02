"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { darkTheme, lightTheme } from "@/styles/theme";
import { desktopSlipPreview } from "./desktop-slip-preview-data";
import { desktopSlipDesigns, type DesktopSlipVariant } from "./desktop-slip-review/designs";
import { DesktopSlipSample } from "./desktop-slip-review/desktop-slip-sample";

const Review = styled.main`
  min-block-size: 100vh; padding: var(--gh-spacing-7) clamp(var(--gh-spacing-3), 3vw, var(--gh-spacing-12)) var(--gh-spacing-10);
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: var(--gh-font-emphasis);
  button, select, input { font: inherit; }
  button, select, a, input { outline-offset: var(--gh-size-0_75); }
  :is(button, select, a, input):focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; }
`;
const Intro = styled.header`
  max-inline-size: var(--gh-size-352); margin-inline: auto; display: grid; gap: var(--gh-spacing-2_25);
  > [data-eyebrow] { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-heavy); letter-spacing: var(--gh-tracking-display); text-transform: uppercase; color: ${({ theme }) => theme.color.link}; }
  h1 { font-size: clamp(var(--gh-font-headline), 3vw, var(--gh-font-displayLarge)); line-height: var(--gh-leading-control); }
  > p { max-inline-size: var(--gh-size-260); line-height: var(--gh-leading-body); color: ${({ theme }) => theme.color.mutedText}; }
`;
const Toolbar = styled.div`
  position: sticky; inset-block-start: 0; z-index: var(--gh-layer-floating); display: flex; flex-wrap: wrap; align-items: end;
  gap: var(--gh-spacing-3); max-inline-size: var(--gh-size-352); margin: var(--gh-spacing-4_5) auto var(--gh-spacing-6); padding: var(--gh-spacing-3);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label, > fieldset { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; }
  > label > span, legend { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-bold); color: ${({ theme }) => theme.color.mutedText}; }
  fieldset { margin: 0; padding: 0; border: 0; }
  legend { margin-block-end: var(--gh-spacing-1_25); }
  fieldset > div { display: flex; }
  button, select { min-block-size: var(--gh-size-11); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); cursor: pointer; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  @media (max-width: ${({ theme }) => theme.viewport[50]}) { position: static; }
`;
const Gallery = styled.div`
  display: grid; gap: var(--gh-spacing-7); max-inline-size: var(--gh-size-352); margin-inline: auto; min-inline-size: 0;
`;
const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: var(--gh-spacing-25);
  > header { display: flex; align-items: center; gap: var(--gh-spacing-2_5); margin-block-end: var(--gh-spacing-2_5); }
  [data-number] { flex: none; align-self: start; font-size: var(--gh-font-heading); line-height: var(--gh-leading-label); color: ${({ theme }) => theme.color.link}; font-weight: var(--gh-weight-heavy); }
  h2 { font-size: var(--gh-font-section); line-height: var(--gh-leading-compact); }
  header p { margin-block-start: var(--gh-spacing-0_5); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); }
  header button { flex: none; margin-inline-start: auto; min-block-size: var(--gh-size-11); padding: var(--gh-spacing-2) var(--gh-spacing-3); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.link}; cursor: pointer; }
`;
const ScrollArea = styled.div`
  overflow: auto; min-inline-size: 0; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surfaceMuted};
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
const Canvas = styled.div`
  inline-size: 100%; min-inline-size: var(--gh-size-256); max-inline-size: none;
  display: grid; gap: var(--gh-spacing-2); padding: var(--gh-spacing-2_5); margin-inline: auto;
  > [data-canvas-context] { display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3); }
  > [data-canvas-context] strong { font-size: var(--gh-font-body); }
  > [data-canvas-context] span { font-size: var(--gh-font-caption); color: ${({ theme }) => theme.color.mutedText}; }
  > [data-preview-guide] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); line-height: var(--gh-leading-normal); }
`;
const SlipGroup = styled.div`
  display: grid; gap: var(--gh-spacing-0_75); min-inline-size: 0;
`;
const Footer = styled.p`
  max-inline-size: var(--gh-size-352); margin: var(--gh-spacing-7) auto 0; padding-block-start: var(--gh-spacing-4); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-prose);
  a { color: ${({ theme }) => theme.color.link}; }
`;

/** Status and score concepts remain isolated from the selected production and mobile displays. */
export function DesktopSlipGallery({ locale }: { locale: string }) {
  const [focused, setFocused] = useState<DesktopSlipVariant | "all">("all");
  const [context, setContext] = useState<"best" | "builder">("best");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const sample = desktopSlipPreview();
  const options = focused === "all" ? desktopSlipDesigns : desktopSlipDesigns.filter((design) => design.id === focused);
  return <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>
    <Review data-desktop-slip-gallery>
      <Intro>
        <p data-eyebrow>Goal Hint · Desktop design review</p>
        <h1>Desktop slips · scores and status</h1>
        <p>Ten concepts with tighter slip spacing, fixed country and league columns, and teams aligned around a shared score or VS. Design 01, Aligned ledger, is now used for desktop Best slips and the slip builder.</p>
        <p>These are desktop canvases at actual size. On a smaller window, scroll within a sample to see its full width.</p>
      </Intro>
      <Toolbar aria-label="Desktop preview controls">
        <fieldset><legend>Display context</legend><div>
          <button type="button" aria-pressed={context === "best"} onClick={() => setContext("best")}>Best slips</button>
          <button type="button" aria-pressed={context === "builder"} onClick={() => setContext("builder")}>Slip builder</button>
        </div></fieldset>
        <FloatingField label={<><span>Design</span></>}><select value={focused} onChange={(event) => setFocused(event.target.value as DesktopSlipVariant | "all")}>
          <option value="all">Compare all 10</option>
          {desktopSlipDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
        </select></FloatingField>
        <fieldset><legend>Appearance</legend><div>
          <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>Light</button>
          <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>Dark</button>
        </div></fieldset>
      </Toolbar>
      <Gallery>
        {options.map((design) => {
          const number = desktopSlipDesigns.findIndex((item) => item.id === design.id) + 1;
          return <Option key={design.id} id={design.id} data-desktop-option={design.id} aria-labelledby={`desktop-${design.id}`}>
            <header><span data-number aria-hidden="true">{String(number).padStart(2, "0")}</span>
              <div><h2 id={`desktop-${design.id}`}>{design.name}</h2><p>{design.description}</p></div>
              <button type="button" onClick={() => setFocused(focused === "all" ? design.id : "all")} aria-label={focused === "all" ? `Inspect ${design.name}` : "Compare all 10 designs"}>{focused === "all" ? "Inspect" : "All 10"}</button>
            </header>
            <ScrollArea tabIndex={0} role="region" aria-label={`${design.name} desktop canvas`} data-desktop-scroll>
              <Canvas data-desktop-canvas key={`${context}-${design.id}`}>
                <div data-canvas-context><strong>{context === "best" ? "Best slips" : "Slip builder"}</strong><span>Sample · {sample.slip.selections.length} selections</span></div>
                <p data-preview-guide>Two collapsed slips and one expanded example · Upcoming, live, half-time, won and lost selections</p>
                <SlipGroup data-preview-slip-group>
                  <DesktopSlipSample {...sample} index={0} locale={locale} variant={design.id} showRank={context === "best"} />
                  <DesktopSlipSample {...sample} index={1} locale={locale} variant={design.id} showRank={context === "best"} />
                  <DesktopSlipSample {...sample} index={2} locale={locale} variant={design.id} showRank={context === "best"} initiallyOpen />
                </SlipGroup>
              </Canvas>
            </ScrollArea>
          </Option>;
        })}
      </Gallery>
      <Footer>Fixtures, scores, clocks and outcomes here are illustrative. Desktop Best slips and the slip builder use design 01, Aligned ledger; the mobile layout is unchanged. Hover or focus a shortened name for its full text; Escape closes the tooltip. Average match probability is the mean of the selections. <a href={`/${locale}/slips/designs`}>View the mobile samples</a>.</Footer>
    </Review>
  </ThemeProvider>;
}
