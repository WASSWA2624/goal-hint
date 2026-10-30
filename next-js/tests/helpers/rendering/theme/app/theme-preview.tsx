"use client";

import { useCallback, useEffect, useState } from "react";
import styled, { useTheme } from "styled-components";
import { Badge } from "@/components/admin/admin-form";
import { Panel as AdminPanel, PanelBody, Segmented } from "@/components/admin/desk-styles";
import { RecordCard } from "@/components/admin/record-workspace";
import { FeatureBody } from "@/components/admin/settings-feature-styles";
import { SettingsForm } from "@/components/admin/settings-styles";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { RailNumber, RailStep, StepRail } from "@/components/members/subscribe-styles";
import { PaymentWizard, WizardActions } from "@/components/members/payment-wizard";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { SlipCard } from "@/components/slips/slip-card";
import { BestSlipsFilters } from "@/components/slips/best-slips-filters";
import { Button, SelectInput, TextInput } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { BodyText, Inline, PageHeading, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { BuiltSlip } from "@/domain/slip-builder";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import { parseReportingDate } from "@/domain/calendar";
import { media } from "@/styles/theme";
import { checkRenderedTheme } from "./theme-checks";

const DatePreview = styled.div`${media.belowDesktop} { display: none; }`;

export function ThemePreview({ fixtures, slip }: { fixtures: FixtureSnapshot[]; slip: BuiltSlip }) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState(defaultBestSlipsQuery(false));
  const [result, setResult] = useState<{ mode: string; width: number; errors: string[] } | null>(null);
  const runChecks = useCallback(() => setResult({ mode: theme.mode, width: window.innerWidth, errors: checkRenderedTheme(theme) }), [theme]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, frame = 0;
    // Inspect the settled card styles after their 160ms theme transition.
    const run = () => { clearTimeout(timer); timer = setTimeout(() => { frame = requestAnimationFrame(runChecks); }, 200); };
    run();
    window.addEventListener("resize", run);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); window.removeEventListener("resize", run); };
  }, [runChecks, dialogOpen]);
  return <Stack $gap="lg" data-theme-fixture data-theme-mode={theme.mode}>
    <div id="theme-phone-header"><AppBrandBar locale="en" /></div>
    <PageHeading>Theme acceptance examples</PageHeading>
    <BodyText>All matches, predictions, slips and payment steps are synthetic. No provider or database is used.</BodyText>
    <Surface id="theme-checks"><Stack $gap="sm">
      <SectionHeading>Rendered theme checks</SectionHeading>
      <p>Use the shared header theme toggle, then resize between phone and desktop.</p>
      <Inline><Button variant="secondary" onClick={runChecks} data-run-theme-checks>Run rendered checks</Button>
        <output data-theme-check-result={result ? result.errors.length ? "failed" : "passed" : "waiting"}
          data-checked-mode={result?.mode} data-checked-width={result?.width} aria-live="polite">
          {result ? `${result.mode}, ${result.width}px: ${result.errors.length ? result.errors.join("; ") : "passed"}` : "Waiting for hydration"}
        </output></Inline>
    </Stack></Surface>
    <section id="theme-radius"><Stack $gap="sm">
      <SectionHeading>Corner radius across screens</SectionHeading>
      <DatePreview><BestSlipsFilters query={query} today={parseReportingDate("2026-10-19")} locale="en" onChange={setQuery} /></DatePreview>
      <AdminPanel id="theme-admin-panel"><PanelBody>
        <Inline><Badge id="theme-radius-badge">Active</Badge></Inline>
        <Segmented id="theme-joined-controls"><button type="button" aria-pressed="true">Active</button><button type="button">History</button></Segmented>
        <SettingsForm onSubmit={(event) => event.preventDefault()}><RecordCard id="theme-admin-record"><FeatureBody>
          <TextInput id="theme-admin-input" label="Admin field" defaultValue="Synthetic" />
          <Button size="large" id="theme-large-action">Large action</Button>
        </FeatureBody></RecordCard></SettingsForm>
      </PanelBody></AdminPanel>
      <PaymentWizard locale="en" step={0} title="Synthetic payment step">
        <TextInput id="theme-payment-input" label="Payment field" defaultValue="Synthetic" />
        <WizardActions><Button id="theme-payment-action">Continue</Button></WizardActions>
      </PaymentWizard>
    </Stack></section>
    <Surface id="theme-controls"><Stack $gap="sm">
      <SectionHeading>Shared controls</SectionHeading>
      <Inline><Button>Primary action</Button><Button variant="secondary" data-surface-control>Secondary action</Button>
        <Button disabled>Disabled action</Button><Button variant="quiet" onClick={() => setDialogOpen(true)} data-open-theme-dialog>Open dialog</Button></Inline>
      <TextInput id="theme-control-input" label="Example input" defaultValue="Synthetic text" />
      <SelectInput id="theme-control-select" label="Example selection" defaultValue="one"><option value="one">First example</option><option value="two">Second example</option></SelectInput>
      <StepRail><RailStep><RailNumber id="theme-member-step">1</RailNumber><h3>Payment step</h3><div><p>Synthetic member payment guidance.</p></div></RailStep></StepRail>
    </Stack></Surface>
    <section id="theme-performance"><PerformanceSummary locale="en" kind="matches"
      title="Synthetic overall performance" period="Synthetic cohort"
      counts={{ total: 120, won: 72, lost: 24, pending: 18, void: 2, unavailable: 3, filteredOut: 1 }} /></section>
    <section id="theme-matches"><Stack $gap="sm"><SectionHeading>Match cards</SectionHeading>
      <MatchCardList>{fixtures.map((fixture, index) => <li key={fixture.fixtureId} style={{ contentVisibility: "visible" }}><MatchCard fixture={fixture} position={index + 1}
        selectedFamily={(["match-result", "total-goals", "both-teams-to-score"] as const)[index]!} analysisSlug="synthetic-preview" /></li>)}</MatchCardList>
    </Stack></section>
    <section id="theme-slips"><Stack $gap="sm"><SectionHeading>Slip card</SectionHeading><SlipCard slip={slip} index={0} locale="en" /></Stack></section>
    <CriteriaDialog id="theme-dialog" title="Synthetic criteria" open={dialogOpen} onCancel={() => setDialogOpen(false)} onApply={() => setDialogOpen(false)}
      applyLabel="Apply" cancelLabel="Cancel" closeLabel="Close dialog"><TextInput label="Example dialog field" defaultValue="Synthetic" /></CriteriaDialog>
  </Stack>;
}
