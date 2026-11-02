"use client";

import { useState } from "react";
import { ThemeProvider } from "styled-components";
import { SlipCard, SlipCardSummary } from "@/components/slips/slip-card";
import { SlipShareAction } from "@/components/slips/slip-share-action";
import { Button } from "@/components/ui/controls";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import type { BuiltSlip } from "@/domain/slip-builder";
import { GlobalStyle } from "@/styles/global-style";
import { darkTheme, lightTheme } from "@/styles/theme";

const source = (slip: BuiltSlip) => ({ source: "best" as const, day: "2026-10-13", slipId: slip.id });

export function HeaderPreview({ slip, longSlip }: { slip: BuiltSlip; longSlip: BuiltSlip }) {
  const [dark, setDark] = useState(false);
  const desktop = useDesktopLayout();
  return <ThemeProvider theme={dark ? darkTheme : lightTheme}><GlobalStyle />
    <main data-slip-header-fixture data-mode={dark ? "dark" : "light"}
      style={{ padding: "var(--gh-spacing-4)", display: "grid", gap: "var(--gh-spacing-4)" }}>
      <Button onClick={() => setDark(value => !value)}>Toggle theme</Button>
      <section data-header-case="closed"><SlipCard slip={slip} index={0} locale="en" initiallyOpen={false} shareSource={source(slip)} /></section>
      <section data-header-case="open"><SlipCard slip={slip} index={1} locale="en" initiallyOpen shareSource={source(slip)} /></section>
      <section data-header-case="long"><SlipCard slip={longSlip} index={2} locale="en" initiallyOpen shareSource={source(longSlip)} /></section>
      <section data-header-case="without-share"><SlipCard slip={slip} index={3} locale="en" initiallyOpen={false} /></section>
      <section data-header-case="summary"><SlipCardSummary index={4} locale="en" totalOdds={slip.totalOdds}
        averageProbability={slip.averageProbability} selectionCount={slip.selections.length}
        headerAction={<SlipShareAction source={source(slip)} locale="en" iconOnly={!desktop} />}>
        <p>Synthetic summary content</p>
      </SlipCardSummary></section>
    </main>
  </ThemeProvider>;
}
