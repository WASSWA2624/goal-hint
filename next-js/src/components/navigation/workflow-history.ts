import { goHistoryBack, writeContextHistory } from "./context-history.ts";

export type WorkflowStep = 0 | 1 | 2 | 3;
const stepNames = ["package", "pay", "details", "review"] as const;
const markerKey = "goalHintWorkflow";
const parameter = "checkoutStep";

type Entry = { flow: string; page: string; step: WorkflowStep; trail: WorkflowStep[] };

export function workflowPage(href: string): string {
  const url = new URL(href);
  return url.pathname + (url.searchParams.get("add") === "credit" ? "?add=credit" : "");
}

export function workflowStep(state: unknown, flow: string, page: string): WorkflowStep | null {
  const entry = (state as Record<string, Entry> | null)?.[markerKey];
  return entry?.flow === flow && entry.page === page && Number.isInteger(entry.step) && stepNames[entry.step] ? entry.step : null;
}

/** Different same-document URLs let WebViews observe Back availability as well as browser chrome. */
export function writeWorkflowStep(flow: string, step: WorkflowStep, mode: "push" | "replace") {
  const url = new URL(window.location.href), page = workflowPage(url.href);
  const current = window.history.state?.[markerKey] as Entry | undefined;
  const sameFlow = current?.flow === flow && current.page === page;
  if (mode === "push" && sameFlow && current.step === step) return;
  if (step === 0) url.searchParams.delete(parameter);
  else url.searchParams.set(parameter, stepNames[step]);
  const previous = sameFlow && Array.isArray(current.trail) ? current.trail : [];
  const trail = mode === "push" && sameFlow ? [...previous, current.step].slice(-8) : previous;
  writeContextHistory({ [markerKey]: { flow, page, step, trail } satisfies Entry }, url.pathname + url.search + url.hash, mode);
}

export function backToWorkflowStep(flow: string, fallback: WorkflowStep): boolean {
  const current = window.history.state?.[markerKey] as Entry | undefined;
  if (current?.flow !== flow || current.page !== workflowPage(window.location.href) || !Array.isArray(current.trail)) return false;
  const previous = current.trail.lastIndexOf(fallback);
  if (previous < 0) return false;
  goHistoryBack(current.trail.length - previous);
  return true;
}
