"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "styled-components";
import { Badge } from "@/components/admin/admin-form";
import { Panel as AdminPanel, PanelBody, Segmented } from "@/components/admin/desk-styles";
import { RecordCard } from "@/components/admin/record-workspace";
import { FeatureBody } from "@/components/admin/settings-feature-styles";
import { SettingsForm } from "@/components/admin/settings-styles";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { SearchBar } from "@/components/ui/search-bar";
import { CheckoutMessage } from "@/components/members/checkout-parts";
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
import { checkRenderedTheme } from "./theme-checks";

export function ThemePreview({ fixtures, slip, edgeSlips }: { fixtures: FixtureSnapshot[]; slip: BuiltSlip; edgeSlips: BuiltSlip[] }) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [query, setQuery] = useState(defaultBestSlipsQuery());
  const [result, setResult] = useState<{ mode: string; width: number; errors: string[]; revision: number } | null>(null);
  const runChecks = useCallback(() => {
    const errors = checkRenderedTheme(theme), width = window.innerWidth;
    setResult(previous => ({ mode: theme.mode, width, errors, revision: (previous?.revision ?? 0) + 1 }));
  }, [theme]);
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
          data-checked-mode={result?.mode} data-checked-width={result?.width} data-check-revision={result?.revision} aria-live="polite">
          {result ? `${result.mode}, ${result.width}px: ${result.errors.length ? result.errors.join("; ") : "passed"}` : "Waiting for hydration"}
        </output></Inline>
    </Stack></Surface>
    <section id="theme-radius"><Stack $gap="sm">
      <SectionHeading>Corner radius across screens</SectionHeading>
      <div id="theme-filters"><BestSlipsFilters query={query} today={parseReportingDate("2026-10-19")} locale="en" statistics={{ total: 12, won: 5, lost: 2, pending: 3, void: 1, cancelled: 1 }} summary={{ asOf: Date.UTC(2026, 10, 3, 17, 30), from: parseReportingDate("2026-11-02"), to: parseReportingDate("2026-11-02"), statistics: null }} onChange={setQuery} /></div>
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
      <form id="theme-search" onSubmit={event => { event.preventDefault(); setSubmittedSearch(String(new FormData(event.currentTarget).get("q") ?? "")); }}><SearchBar id="theme-search-input" name="q" label="Synthetic search" submitLabel="Search"
        filters={{ label: "Advanced filters", dialogId: "theme-dialog", open: dialogOpen, onOpen: () => setDialogOpen(true) }} /></form>
      <output data-submitted-search>{submittedSearch}</output>
      <form id="theme-local-search" onSubmit={event => { event.preventDefault(); setLocalSearch("wrong parent submission"); }}>
        <SearchBar label="Find a local item" submitLabel="Find" onSearch={() => setLocalSearch("local search executed")} />
        <output data-local-search>{localSearch}</output>
      </form>
      <SearchBar id="theme-instant-search" label="Find within options" />
      <SearchBar id="theme-disabled-search" label="Unavailable search" submitLabel="Search" disabled />
      <CheckoutMessage id="theme-textarea" aria-label="Synthetic message" defaultValue="Synthetic text" />
      <TextInput id="theme-invalid-input" label="Invalid example" defaultValue="Synthetic" error="Synthetic validation message" />
      <TextInput id="theme-disabled-input" label="Disabled example" defaultValue="Synthetic" disabled />
      <SelectInput id="theme-control-select" label="Example selection" defaultValue="one"><option value="one">First example</option><option value="two">Second example</option></SelectInput>
      <StepRail><RailStep><RailNumber id="theme-member-step">1</RailNumber><h3>Payment step</h3><div><p>Synthetic member payment guidance.</p></div></RailStep></StepRail>
    </Stack></Surface>
    <section id="theme-performance"><PerformanceSummary locale="en" kind="matches"
      period="02-Nov-2026 · EAT" showAll={false}
      counts={{ total: 120, won: 72, lost: 24, pending: 18, void: 2, unavailable: 3, filteredOut: 1 }} /></section>
    <section id="theme-narrow-performance" style={{ maxWidth: theme.size[76] }}><PerformanceSummary locale="en" kind="slips"
      period="01–03-Nov-2026 · EAT" counts={{ total: 1234567890, won: 1234567890, lost: 0, pending: 0 }} /></section>
    <section id="theme-matches"><Stack $gap="sm"><SectionHeading>Match cards</SectionHeading>
      <MatchCardList>{fixtures.map((fixture, index) => <li key={fixture.fixtureId} style={{ contentVisibility: "visible" }}><MatchCard fixture={fixture} position={index + 1}
        selectedFamily={(["match-result", "total-goals", "both-teams-to-score"] as const)[index]!} analysisSlug="synthetic-preview" /></li>)}</MatchCardList>
    </Stack></section>
    <section id="theme-slips"><Stack $gap="sm"><SectionHeading>Slip card</SectionHeading><SlipCard slip={slip} index={0} locale="en" /></Stack></section>
    <section id="theme-joined-slips"><Stack $gap="sm"><SectionHeading>Joined selection edges</SectionHeading>
      {edgeSlips.map((example, index) => <SlipCard key={example.id} slip={example} index={index + 1} locale="en" initiallyOpen />)}
    </Stack></section>
    <CriteriaDialog id="theme-dialog" title="Synthetic criteria" open={dialogOpen} onCancel={() => setDialogOpen(false)} onApply={() => setDialogOpen(false)}
      applyLabel="Apply" cancelLabel="Cancel" closeLabel="Close dialog"><TextInput label="Example dialog field" defaultValue="Synthetic" /></CriteriaDialog>
  </Stack>;
}
