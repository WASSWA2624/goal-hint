"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { darkTheme, lightTheme } from "@/styles/theme";
import { desktopSlipPreview } from "./desktop-slip-preview-data";
import { desktopSlipDesigns, type DesktopSlipVariant } from "./desktop-slip-review/designs";
import { DesktopSlipSample } from "./desktop-slip-review/desktop-slip-sample";

const Review = styled.main`
  min-block-size: 100vh; padding: 28px clamp(12px, 3vw, 48px) 40px;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: 0.875rem;
  button, select, input { font: inherit; border-radius: 0; }
  button, select, a, input { outline-offset: 3px; }
  :is(button, select, a, input):focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; }
`;
const Intro = styled.header`
  max-inline-size: 88rem; margin-inline: auto; display: grid; gap: 9px;
  > [data-eyebrow] { font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${({ theme }) => theme.color.link}; }
  h1 { font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.2; }
  > p { max-inline-size: 65rem; line-height: 1.6; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Toolbar = styled.div`
  position: sticky; inset-block-start: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: end;
  gap: 12px; max-inline-size: 88rem; margin: 18px auto 24px; padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label, > fieldset { display: grid; gap: 5px; min-inline-size: 0; }
  > label > span, legend { font-size: 0.6875rem; font-weight: 700; color: ${({ theme }) => theme.color.mutedText}; }
  fieldset { margin: 0; padding: 0; border: 0; }
  legend { margin-block-end: 5px; }
  fieldset > div { display: flex; }
  button, select { min-block-size: 44px; padding: 8px 10px; cursor: pointer; border: 1px solid ${({ theme }) => theme.color.controlBorder}; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; }
  button + button { border-inline-start: 0; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  @media (max-width: 50rem) { position: static; }
`;
const Gallery = styled.div`
  display: grid; gap: 28px; max-inline-size: 88rem; margin-inline: auto; min-inline-size: 0;
`;
const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: 100px;
  > header { display: flex; align-items: center; gap: 10px; margin-block-end: 10px; }
  [data-number] { flex: none; align-self: start; font-size: 1.25rem; line-height: 1.3; color: ${({ theme }) => theme.color.link}; font-weight: 800; }
  h2 { font-size: 1rem; line-height: 1.4; }
  header p { margin-block-start: 2px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5; }
  header button { flex: none; margin-inline-start: auto; min-block-size: 44px; padding: 8px 12px; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.link}; cursor: pointer; }
`;
const ScrollArea = styled.div`
  overflow: auto; min-inline-size: 0; border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surfaceMuted};
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
const Canvas = styled.div`
  inline-size: 100%; min-inline-size: 64rem; max-inline-size: none;
  display: grid; gap: 8px; padding: 10px; margin-inline: auto;
  > [data-canvas-context] { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  > [data-canvas-context] strong { font-size: 0.8125rem; }
  > [data-canvas-context] span { font-size: 0.6875rem; color: ${({ theme }) => theme.color.mutedText}; }
  > [data-preview-guide] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; line-height: 1.5; }
`;
const SlipGroup = styled.div`
  display: grid; gap: 3px; min-inline-size: 0;
`;
const Footer = styled.p`
  max-inline-size: 88rem; margin: 28px auto 0; padding-block-start: 16px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.7;
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
        <label><span>Design</span><select value={focused} onChange={(event) => setFocused(event.target.value as DesktopSlipVariant | "all")}>
          <option value="all">Compare all 10</option>
          {desktopSlipDesigns.map((design, index) => <option key={design.id} value={design.id}>{String(index + 1).padStart(2, "0")} · {design.name}</option>)}
        </select></label>
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
