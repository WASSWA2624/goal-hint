"use client";

import { useState, type FormEvent } from "react";
import styled from "styled-components";
import { Muted, Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPlanLength, formatUgx, planRules, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, Badge, ButtonRow, FieldBlock, FieldError, FieldRow, FormStack, Hint, postAdmin, replyErrors, replyMessage } from "./admin-form";

type Draft = Readonly<{ name: string; durationDays: string; priceUgx: string }>;
type Status = Readonly<{ tone: "info" | "error"; text: string }> | null;
const emptyDraft: Draft = { name: "", durationDays: "", priceUgx: "" };
const draftOf = (plan: SubscriptionPlanView): Draft => ({ name: plan.name, durationDays: String(plan.durationDays), priceUgx: String(plan.priceUgx) });
/** Whole numbers only; anything else is sent as-is so the server names the problem. */
const whole = (value: string) => (/^\d+$/u.test(value.trim()) ? Number(value.trim()) : value);
const fieldsOf = (draft: Draft) => ({ name: draft.name, durationDays: whole(draft.durationDays), priceUgx: whole(draft.priceUgx) });

/**
 * The Plans page: add, edit, deactivate, reactivate and reorder. Plans are never deleted. Every action is one JSON POST
 * to `/api/admin/plans`, whose reply carries the whole list, so the page always shows what is stored.
 */
export function PlansEditor({ initialPlans }: { initialPlans: readonly SubscriptionPlanView[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Readonly<{ id: string; draft: Draft; errors: Record<string, string> }> | null>(null);

  async function send(body: Record<string, unknown>, done: string): Promise<Record<string, string> | null> {
    setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/plans", body);
    setBusy(false);
    if (reply.ok && Array.isArray(reply.body.plans)) {
      setPlans(reply.body.plans as SubscriptionPlanView[]);
      setStatus({ tone: "info", text: done });
      return null;
    }
    const errors = replyErrors(reply);
    setStatus({ tone: "error", text: errors.order ?? replyMessage(reply, "The change was not saved.") });
    return errors;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const refused = await send({ action: "create", plan: fieldsOf(draft) }, `Added ${draft.name.trim()}.`);
    setErrors(refused ?? {});
    if (!refused) setDraft(emptyDraft);
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const refused = await send({ action: "edit", id: editing.id, plan: fieldsOf(editing.draft) }, "Plan saved.");
    setEditing(refused ? { ...editing, errors: refused } : null);
  }
  function move(index: number, offset: -1 | 1) {
    const ids = plans.map(({ id }) => id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    void send({ action: "reorder", ids }, "Order saved.");
  }

  return (
    <>
      <Panel aria-labelledby="add-plan-title">
        <PanelHeader><h2 id="add-plan-title">Add a plan</h2></PanelHeader>
        <Muted>Every plan unlocks every feature; plans differ only in length and price. A day is 24 hours from payment confirmation, never a calendar day.</Muted>
        <ButtonRow>{[{ name: "Daily", days: 1, price: 1000 }, { name: "Weekly", days: 7, price: 5000 }, { name: "Monthly", days: 30, price: 20000 }].map((preset) =>
          <ActionButton key={preset.name} type="button" disabled={busy} onClick={() => { setErrors({}); setDraft({ name: preset.name, durationDays: String(preset.days), priceUgx: String(preset.price) }); }}>{preset.name}</ActionButton>)}</ButtonRow>
        <form onSubmit={create} noValidate>
          <FormStack>
            <PlanFields draft={draft} errors={errors} onChange={setDraft} idPrefix="new" disabled={busy} />
            <ButtonRow><ActionButton type="submit" $variant="primary" disabled={busy}>Add plan</ActionButton></ButtonRow>
          </FormStack>
        </form>
      </Panel>
      <Panel aria-labelledby="plans-title" $busy={busy} aria-busy={busy}>
        <PanelHeader>
          <h2 id="plans-title">Plans</h2>
          <p>{plans.filter(({ active }) => active).length} active · the first active plan is preselected on Get access</p>
        </PanelHeader>
        {plans.length === 0 ? <Muted>No plans yet. Add each plan you offer, for example Daily: 1 day, UGX 1,000.</Muted> : (
          <PlanList>
            {plans.map((plan, index) => (
              <li key={plan.id} aria-label={plan.name}>
                {editing?.id === plan.id ? (
                  <form onSubmit={saveEdit} noValidate>
                    <FormStack>
                      <PlanFields draft={editing.draft} errors={editing.errors} onChange={(next) => setEditing({ ...editing, draft: next })}
                        idPrefix={`edit-${plan.id}`} disabled={busy} />
                      <Muted>Codes and payments keep the name, days and price they were created with.</Muted>
                      <ButtonRow>
                        <ActionButton type="submit" $variant="primary" disabled={busy}>Save plan</ActionButton>
                        <ActionButton type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</ActionButton>
                      </ButtonRow>
                    </FormStack>
                  </form>
                ) : (
                  <>
                    <PlanSummary>
                      <strong>{plan.name}</strong>
                      <Meta>{formatPlanLength(plan.durationDays)} · {formatUgx(plan.priceUgx)}</Meta>
                      <Badge $tone={plan.active ? "good" : "muted"}>{plan.active ? "Active" : "Inactive"}</Badge>
                    </PlanSummary>
                    <ButtonRow>
                      <ActionButton type="button" disabled={busy} onClick={() => { setStatus(null); setEditing({ id: plan.id, draft: draftOf(plan), errors: {} }); }}>Edit</ActionButton>
                      <ActionButton type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${plan.name} up`}>Up</ActionButton>
                      <ActionButton type="button" disabled={busy || index === plans.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${plan.name} down`}>Down</ActionButton>
                      <ActionButton type="button" disabled={busy} onClick={() => void send({ action: plan.active ? "deactivate" : "activate", id: plan.id },
                        `${plan.name} ${plan.active ? "deactivated" : "activated"}.`)}>{plan.active ? "Deactivate" : "Activate"}</ActionButton>
                    </ButtonRow>
                  </>
                )}
              </li>
            ))}
          </PlanList>
        )}
        <Muted>Plans are never deleted, so payments and codes keep pointing at them. Deactivate a plan to hide it from Get access.</Muted>
      </Panel>
      {status && <Notice $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}</Notice>}
    </>
  );
}

function PlanFields({ draft, errors, onChange, idPrefix, disabled }: {
  draft: Draft; errors: Record<string, string>; onChange: (draft: Draft) => void; idPrefix: string; disabled: boolean;
}) {
  const field = (key: keyof Draft) => ({
    id: `${idPrefix}-${key}`, value: draft[key], disabled, "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${idPrefix}-${key}-error` : undefined,
    onChange: (event: { target: { value: string } }) => onChange({ ...draft, [key]: event.target.value }),
  });
  const error = (key: keyof Draft) => errors[key] && <FieldError id={`${idPrefix}-${key}-error`}>{errors[key]}</FieldError>;
  return (
    <>
      <FieldBlock>Name<input {...field("name")} maxLength={planRules.nameMaxLength} autoComplete="off" required />{error("name")}</FieldBlock>
      <FieldRow>
        <FieldBlock>Days<input {...field("durationDays")} inputMode="numeric" autoComplete="off" required />
          <Hint>{planRules.durationDays.min}–{planRules.durationDays.max}; 1 is 24 hours</Hint>{error("durationDays")}</FieldBlock>
        <FieldBlock>Price (UGX)<input {...field("priceUgx")} inputMode="numeric" autoComplete="off" required />
          <Hint>Whole shillings, {formatUgx(planRules.priceUgx.min)} to {formatUgx(planRules.priceUgx.max)}</Hint>{error("priceUgx")}</FieldBlock>
      </FieldRow>
      {errors.plan && <FieldError role="alert">{errors.plan}</FieldError>}
    </>
  );
}

const PlanList = styled.ol`
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: ${({ theme }) => theme.color.border};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  li { display: grid; gap: 10px; padding: 12px; background: ${({ theme }) => theme.color.surface}; }
`;
const PlanSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  strong { font-size: 1.0625rem; }
`;
const Meta = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-variant-numeric: tabular-nums;
`;
