"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import styled from "styled-components";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, LayersIcon, PencilIcon, PlusIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { formatPlanLength, formatUgx, planRules, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { media } from "@/styles/theme";
import { ActionButton, Badge, FieldBlock, FieldError, Hint, postAdmin, replyErrors, replyMessage } from "./admin-form";
import { DeskGrid, DeskHead, DeskTitle, Drawer, EmptyPanel, Panel, PanelHead, TextAction } from "./desk-styles";

type Draft = Readonly<{ name: string; durationDays: string; priceUgx: string }>;
type Status = Readonly<{ tone: "info" | "error"; text: string; where: "add" | "list" }> | null;
const emptyDraft: Draft = { name: "", durationDays: "", priceUgx: "" };
const presets = [{ name: "Daily", days: 1, price: 1000 }, { name: "Weekly", days: 7, price: 5000 }, { name: "Monthly", days: 30, price: 20000 }] as const;
const draftOf = (plan: SubscriptionPlanView): Draft => ({ name: plan.name, durationDays: String(plan.durationDays), priceUgx: String(plan.priceUgx) });
/** Whole numbers only; anything else is sent as-is so the server names the problem. */
const whole = (value: string) => (/^\d+$/u.test(value.trim()) ? Number(value.trim()) : value);
const fieldsOf = (draft: Draft) => ({ name: draft.name, durationDays: whole(draft.durationDays), priceUgx: whole(draft.priceUgx) });
const fieldKeys = ["name", "durationDays", "priceUgx"] as const;
/** The first field a refused reply names, or null when the refusal is about the whole plan. */
const firstInvalid = (prefix: string, errors: Record<string, string>) => {
  const key = fieldKeys.find(name => errors[name]);
  return key ? document.getElementById(`${prefix}-${key}`) : null;
};

/**
 * The Plans page: add, edit, deactivate, reactivate and reorder. Plans are never deleted. Every action is one JSON POST
 * to `/api/admin/plans`, whose reply carries the whole list, so the page always shows what is stored. The title row
 * lives here because its active count follows every change.
 */
export function PlansEditor({ initialPlans }: { initialPlans: readonly SubscriptionPlanView[] }) {
  const desktop = useDesktopLayout();
  const [plans, setPlans] = useState(initialPlans);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Readonly<{ id: string; draft: Draft; errors: Record<string, string> }> | null>(null);
  const [addOpen, setAddOpen] = useState(initialPlans.length === 0);
  // Every button is disabled while a change is saved, which drops focus; put it back once the reply has rendered.
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    if (busy || !refocus.current) return;
    const target = refocus.current(); refocus.current = null; target?.focus();
  });
  const control = (key: string) => (node: HTMLButtonElement | null) => { if (node) controls.current.set(key, node); else controls.current.delete(key); };

  async function send(body: Record<string, unknown>, done: string, where: "add" | "list"): Promise<Record<string, string> | null> {
    setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/plans", body);
    setBusy(false);
    if (reply.ok && Array.isArray(reply.body.plans)) {
      setPlans(reply.body.plans as SubscriptionPlanView[]);
      setStatus({ tone: "info", text: done, where });
      return null;
    }
    const errors = replyErrors(reply);
    setStatus({ tone: "error", text: errors.order ?? replyMessage(reply, "The change was not saved."), where });
    return errors;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const refused = await send({ action: "create", plan: fieldsOf(draft) }, `Added ${draft.name.trim()}.`, "add");
    setErrors(refused ?? {});
    if (!refused) setDraft(emptyDraft);
    refocus.current = () => (refused && firstInvalid("new", refused)) || document.getElementById("new-plan-submit");
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const { id } = editing, refused = await send({ action: "edit", id, plan: fieldsOf(editing.draft) }, "Plan saved.", "list");
    setEditing(refused ? { ...editing, errors: refused } : null);
    refocus.current = () => (refused ? firstInvalid(`edit-${id}`, refused) ?? document.getElementById(`edit-${id}-save`) : controls.current.get(`${id}:edit`));
  }
  function closeEdit(id: string) {
    setEditing(null);
    refocus.current = () => controls.current.get(`${id}:edit`);
  }
  function move(index: number, offset: -1 | 1) {
    const ids = plans.map(({ id }) => id), id = ids[index]!;
    ids.splice(index, 1);
    ids.splice(index + offset, 0, id);
    void send({ action: "reorder", ids }, "Order saved.", "list");
    // At the top or bottom the pressed arrow is disabled, so the other one takes focus.
    const pressed = offset < 0 ? "up" : "down", other = offset < 0 ? "down" : "up";
    refocus.current = () => { const button = controls.current.get(`${id}:${pressed}`); return button && !button.disabled ? button : controls.current.get(`${id}:${other}`); };
  }
  function toggle(plan: SubscriptionPlanView) {
    void send({ action: plan.active ? "deactivate" : "activate", id: plan.id }, `${plan.name} ${plan.active ? "deactivated" : "activated"}.`, "list");
    refocus.current = () => controls.current.get(`${plan.id}:toggle`);
  }

  const notice = (where: "add" | "list") => status?.where === where
    && <Notice $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}</Notice>;
  const addForm = <AddForm onSubmit={create} noValidate aria-labelledby={desktop ? "add-plan-title" : "add-plan-summary"} $drawer={!desktop}>
    <Hint as="p">Every plan unlocks every feature; plans differ only in length and price. A day is 24 hours from payment confirmation, never a calendar day.</Hint>
    <Presets role="group" aria-label="Fill from a preset">{presets.map(preset =>
      <ActionButton key={preset.name} type="button" disabled={busy} onClick={() => { setErrors({}); setDraft({ name: preset.name, durationDays: String(preset.days), priceUgx: String(preset.price) }); }}>{preset.name}</ActionButton>)}</Presets>
    <PlanFields draft={draft} errors={errors} onChange={setDraft} idPrefix="new" disabled={busy} hints />
    {notice("add")}
    <ActionButton id="new-plan-submit" type="submit" $variant="primary" disabled={busy}><PlusIcon />Add plan</ActionButton>
  </AddForm>;

  return (
    <>
      <DeskHead><DeskTitle><h1>Plans</h1><p>{plans.filter(({ active }) => active).length} active · first active plan is preselected on Get access</p></DeskTitle></DeskHead>
      <DeskGrid>
        <ListPanel aria-label="Plan list" $busy={busy} aria-busy={busy}>
          {status?.where === "list" && <ListNotice>{notice("list")}</ListNotice>}
          {plans.length === 0 ? <EmptyPanel><LayersIcon /><strong>No plans yet.</strong><p>Add each plan you offer, for example Daily: 1 day, UGX 1,000.</p></EmptyPanel> : (
            <PlanList>
              {plans.map((plan, index) => {
                const open = editing?.id === plan.id;
                return <li key={plan.id} aria-label={plan.name}>
                  <PlanSummary>
                    <PlanName><strong>{plan.name}</strong><Badge $tone={plan.active ? "good" : "muted"}>{plan.active ? "Active" : "Inactive"}</Badge></PlanName>
                    <PlanMeta>{formatPlanLength(plan.durationDays)} · {formatUgx(plan.priceUgx)}</PlanMeta>
                  </PlanSummary>
                  <PlanActions>
                    <Square ref={control(`${plan.id}:up`)} type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${plan.name} up`}><ArrowUpIcon /></Square>
                    <Square ref={control(`${plan.id}:down`)} type="button" disabled={busy || index === plans.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${plan.name} down`}><ArrowDownIcon /></Square>
                    <TextAction ref={control(`${plan.id}:edit`)} type="button" disabled={busy} aria-expanded={open} aria-controls={open ? `plan-edit-${plan.id}` : undefined}
                      onClick={() => { if (open) closeEdit(plan.id); else { setStatus(null); setEditing({ id: plan.id, draft: draftOf(plan), errors: {} }); } }}><PencilIcon />Edit</TextAction>
                    <ToggleAction ref={control(`${plan.id}:toggle`)} type="button" disabled={busy} onClick={() => toggle(plan)}>{plan.active ? "Deactivate" : "Activate"}</ToggleAction>
                  </PlanActions>
                  {open && <PlanEdit plan={plan} draft={editing.draft} errors={editing.errors} busy={busy} onSave={saveEdit} onCancel={() => closeEdit(plan.id)}
                    onChange={next => setEditing({ ...editing, draft: next })} />}
                </li>;
              })}
            </PlanList>
          )}
          <Footnote>Plans are never deleted. Deactivate one to hide it from Get access.</Footnote>
        </ListPanel>
        {desktop ? <Panel aria-labelledby="add-plan-title"><PanelHead><h2 id="add-plan-title">Add a plan</h2></PanelHead>{addForm}</Panel>
          : <Panel><Drawer open={addOpen} onToggle={event => setAddOpen(event.currentTarget.open)}>
            <summary id="add-plan-summary"><PlusIcon />Add a plan<ChevronDownIcon /></summary>{addForm}
          </Drawer></Panel>}
      </DeskGrid>
    </>
  );
}

function PlanEdit({ plan, draft, errors, busy, onChange, onSave, onCancel }: {
  plan: SubscriptionPlanView; draft: Draft; errors: Record<string, string>; busy: boolean;
  onChange: (draft: Draft) => void; onSave: (event: FormEvent) => void; onCancel: () => void;
}) {
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => { name.current?.focus(); }, []);
  return (
    <EditForm id={`plan-edit-${plan.id}`} aria-label={`Edit ${plan.name}`} onSubmit={onSave} noValidate
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); } }}>
      <PlanFields draft={draft} errors={errors} onChange={onChange} idPrefix={`edit-${plan.id}`} disabled={busy} nameRef={name} />
      <EditFoot>
        <Hint as="p">Codes and payments keep the name, days and price they were created with.</Hint>
        <EditButtons>
          <ActionButton id={`edit-${plan.id}-save`} type="submit" $variant="primary" disabled={busy}>Save plan</ActionButton>
          <ActionButton type="button" disabled={busy} onClick={onCancel}>Cancel</ActionButton>
        </EditButtons>
      </EditFoot>
    </EditForm>
  );
}

/** Name, days and price; the add form also shows the allowed ranges, which the edit form leaves to the server's errors. */
function PlanFields({ draft, errors, onChange, idPrefix, disabled, hints = false, nameRef }: {
  draft: Draft; errors: Record<string, string>; onChange: (draft: Draft) => void; idPrefix: string; disabled: boolean; hints?: boolean;
  nameRef?: RefObject<HTMLInputElement | null>;
}) {
  const hintText: Partial<Record<keyof Draft, string>> = hints ? {
    durationDays: `${planRules.durationDays.min}–${planRules.durationDays.max}; 1 is 24 hours`,
    priceUgx: `${formatUgx(planRules.priceUgx.min)} to ${formatUgx(planRules.priceUgx.max).replace(/^UGX /u, "")}`,
  } : {};
  const field = (key: keyof Draft) => {
    const described = [hintText[key] && `${idPrefix}-${key}-hint`, errors[key] && `${idPrefix}-${key}-error`].filter(Boolean).join(" ");
    return { id: `${idPrefix}-${key}`, value: draft[key], disabled, "aria-invalid": errors[key] ? true : undefined, "aria-describedby": described || undefined,
      onChange: (event: { target: { value: string } }) => onChange({ ...draft, [key]: event.target.value }) };
  };
  const notes = (key: keyof Draft) => <>{hintText[key] && <Hint id={`${idPrefix}-${key}-hint`}>{hintText[key]}</Hint>}
    {errors[key] && <FieldError id={`${idPrefix}-${key}-error`}>{errors[key]}</FieldError>}</>;
  return (
    <Fields $edit={!hints}>
      <FieldBlock>Name<input ref={nameRef} {...field("name")} maxLength={planRules.nameMaxLength} autoComplete="off" required />{notes("name")}</FieldBlock>
      <FieldBlock>Days<input {...field("durationDays")} inputMode="numeric" autoComplete="off" required />{notes("durationDays")}</FieldBlock>
      <FieldBlock>Price (UGX)<input {...field("priceUgx")} inputMode="numeric" autoComplete="off" required />{notes("priceUgx")}</FieldBlock>
      {errors.plan && <FieldError role="alert">{errors.plan}</FieldError>}
    </Fields>
  );
}

/** Rows follow the panel's width, not the screen's: at 1024px the list column is phone-narrow beside Add a plan. */
const ListPanel = styled(Panel)<{ $busy: boolean }>`
  container-type: inline-size;
  transition: opacity 120ms;
  opacity: ${({ $busy }) => ($busy ? 0.55 : 1)};
`;
const ListNotice = styled.div`
  padding: 12px 14px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${media.desktop} { padding-inline: 16px; }
`;
const PlanList = styled.ol`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  > li {
    display: grid;
    gap: 4px;
    min-inline-size: 0;
    padding: 10px 14px 12px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
  > li:last-child { border-block-end: 0; }
  ${media.desktop} { > li { padding-inline: 16px; } }
  @container (min-width: 34rem) { > li { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 16px; padding-block: 12px; } }
`;
/** Name and badge, then length and price: one line in a narrow list, two beside the actions in a wide one. */
const PlanSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 10px;
  min-inline-size: 0;
  @container (min-width: 34rem) { display: grid; justify-content: start; }
`;
const PlanName = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-inline-size: 0;
  strong { font-size: 0.9375rem; overflow-wrap: anywhere; }
`;
const PlanMeta = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-variant-numeric: tabular-nums;
`;
const PlanActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;
/** Square arrow button: 44px on phones, 36px from desktop up. */
const Square = styled.button`
  display: grid;
  place-items: center;
  inline-size: ${({ theme }) => theme.control.minHeight};
  block-size: ${({ theme }) => theme.control.minHeight};
  padding: 0;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  cursor: pointer;
  > svg { font-size: 1.125rem; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; opacity: 0.6; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { inline-size: 36px; block-size: 36px; > svg { font-size: 1rem; } }
`;
/** Activate and Deactivate differ in width; a fixed end column keeps the rows aligned in a wide list. */
const ToggleAction = styled(TextAction)`
  @container (min-width: 34rem) { min-inline-size: 6rem; justify-content: flex-end; }
`;
const EditForm = styled.form`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  margin-block-start: 6px;
  padding: 12px;
  background: ${({ theme }) => theme.color.page};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  ${media.desktop} { padding: 14px; }
  @container (min-width: 34rem) { grid-column: 1 / -1; }
`;
const EditFoot = styled.div`
  display: grid;
  gap: 12px;
  @container (min-width: 34rem) { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; }
`;
const EditButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @container (min-width: 34rem) { display: flex; flex-direction: row-reverse; margin-inline-start: auto; }
`;
/** Two columns with the name across both; the edit form puts all three side by side in a wide list. */
const Fields = styled.div<{ $edit: boolean }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 10px;
  min-inline-size: 0;
  > :first-child, > [role="alert"] { grid-column: 1 / -1; }
  ${({ $edit }) => $edit && `@container (min-width: 34rem) { grid-template-columns: repeat(3, minmax(0, 1fr)); > :first-child { grid-column: auto; } }`}
`;
const Footnote = styled.p`
  padding: 12px 14px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} { padding: 14px 16px; }
`;
const AddForm = styled.form<{ $drawer: boolean }>`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  border-block-start: ${({ theme, $drawer }) => $drawer ? `${theme.border.width} solid ${theme.color.border}` : "0"};
  ${media.desktop} { padding: 14px 16px 16px; }
`;
const Presets = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  > button { padding-inline: 6px; }
`;
