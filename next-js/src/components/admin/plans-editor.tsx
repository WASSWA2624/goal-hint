"use client";

import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { SearchBar } from "@/components/ui/search-bar";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { ArrowDownIcon, ArrowUpIcon, LayersIcon, PlusIcon } from "@/components/ui/icons";
import { formatPlanLength, formatUgx, planRules, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { media } from "@/styles/theme";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { ActionButton, Badge, FieldBlock, FieldError, Hint, postAdmin, replyErrors, replyMessage } from "./admin-form";
import { TextAction } from "./desk-styles";
import { FloatingField } from "./floating-field";
import { PlanDeleteDialog } from "./plan-delete-dialog";
import { RecordFormDialog, RecordPrimaryAction, RecordToolbar } from "./record-toolbar";
import { useAdminRefresh } from "./use-admin-refresh";
import { RecordBack, RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordEmpty, RecordFeedback, RecordFooter, RecordItem,
  RecordItemTitle, RecordList, RecordListFooter, RecordListScroll, RecordRowContent, RecordScroll, RecordWorkspace, useRecordView } from "./record-workspace";

type Draft = Readonly<{ name: string; durationDays: string; priceUgx: string }>;
type Status = Readonly<{ tone: "info" | "error"; text: string }> | null;
const emptyDraft: Draft = { name: "", durationDays: "", priceUgx: "" };
const presets = [{ name: "Daily", days: 1, price: 1000 }, { name: "Weekly", days: 7, price: 5000 }, { name: "Monthly", days: 30, price: 20000 }] as const;
const draftOf = (plan: SubscriptionPlanView): Draft => ({ name: plan.name, durationDays: String(plan.durationDays), priceUgx: String(plan.priceUgx) });
/** Whole numbers only; anything else is sent as-is so the server names the problem. */
const whole = (value: string) => (/^\d+$/u.test(value.trim()) ? Number(value.trim()) : value);
const fieldsOf = (draft: Draft) => ({ name: draft.name, durationDays: whole(draft.durationDays), priceUgx: whole(draft.priceUgx) });
const fieldKeys = ["name", "durationDays", "priceUgx"] as const;
const controlId = (key: string) => `plan-control-${key}`;
const controlFor = (key: string) => document.getElementById(controlId(key)) as HTMLButtonElement | null;
/** The first field a refused reply names, or null when the refusal is about the whole plan. */
const firstInvalid = (prefix: string, errors: Record<string, string>) => {
  const key = fieldKeys.find(name => errors[name]);
  return key ? document.getElementById(`${prefix}-${key}`) : null;
};

/**
 * The Plans page: add, edit, deactivate, reactivate, reorder and delete unused plans. Every change is one JSON POST
 * to `/api/admin/plans`, whose reply carries the whole list, so the page always shows what is stored.
 */
export function PlansEditor({ initialPlans, initialSelectedId }: { initialPlans: readonly SubscriptionPlanView[]; initialSelectedId?: string }) {
  const router = useRouter(), desktop = useDesktopLayout(), inFlight = useRef(false), id = useId();
  const { detailOpen, openDetail, closeDetail } = useRecordView({ initiallyOpen: !!initialSelectedId });
  const [plans, setPlans] = useState(initialPlans);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(message => setStatus({
    tone: "error", text: `The change was saved. ${message}`,
  }));
  const busy = saving || refreshing;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Readonly<{ id: string; draft: Draft; errors: Record<string, string> }> | null>(null);
  const [removing, setRemoving] = useState<SubscriptionPlanView | null>(null);
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? initialPlans[0]?.id ?? ""), [adding, setAdding] = useState(false), [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false), [planStatus, setPlanStatus] = useState("all"), [draftStatus, setDraftStatus] = useState("all");
  const listedPlans = plans.filter(plan => {
    const state = plan.active ? "active" : "inactive";
    return (planStatus === "all" || state === planStatus) && `${plan.name} ${plan.durationDays} ${plan.priceUgx} ${state}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const selected = (detailOpen && !desktop ? plans : listedPlans).find(plan => plan.id === selectedId) ?? listedPlans[0];
  const savedDraft = selected && draftOf(selected);
  const activeEdit = selected && savedDraft ? editing?.id === selected.id ? editing : { id: selected.id, draft: savedDraft, errors: {} } : null;
  const dirty = !!savedDraft && !!activeEdit && fieldKeys.some(key => activeEdit.draft[key] !== savedDraft[key]);
  // Every button is disabled while a change is saved, which drops focus; put it back once the reply has rendered.
  const refocus = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    if (busy || !refocus.current) return;
    const target = refocus.current(); refocus.current = null; target?.focus();
  });

  async function send(body: Record<string, unknown>, done: string): Promise<Record<string, string> | null> {
    inFlight.current = true;
    setSaving(true); setStatus(null);
    const reply = await postAdmin("/api/admin/plans", body);
    inFlight.current = false;
    setSaving(false);
    if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
    if (reply.ok && Array.isArray(reply.body.plans)) {
      setPlans(reply.body.plans as SubscriptionPlanView[]);
      setStatus({ tone: "info", text: done });
      refreshAdmin();
      return null;
    }
    const errors = replyErrors(reply);
    setStatus({ tone: "error", text: errors.order ?? replyMessage(reply, "The change was not saved.") });
    return errors;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    const refused = await send({ action: "create", plan: fieldsOf(draft) }, `Added ${draft.name.trim()}.`);
    setErrors(refused ?? {});
    if (!refused) { setDraft(emptyDraft); setAdding(false); }
    refocus.current = () => (refused && firstInvalid("new", refused)) || document.getElementById(refused ? "new-plan-submit" : "add-plan-open");
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy || !activeEdit || !dirty) return;
    const { id } = activeEdit, refused = await send({ action: "edit", id, plan: fieldsOf(activeEdit.draft) }, "Plan saved.");
    setEditing(refused ? { ...activeEdit, errors: refused } : null);
    refocus.current = () => (refused && firstInvalid(`edit-${id}`, refused)) || document.getElementById(`edit-${id}-name`) || document.getElementById("plan-list");
  }
  function closeEdit(event?: MouseEvent<HTMLButtonElement>) {
    setEditing(null);
    if (!desktop) closeDetail(event);
    if (desktop && selected) refocus.current = () => controlFor(`${selected.id}:edit`);
  }
  function move(index: number, offset: -1 | 1) {
    if (inFlight.current || busy) return;
    const ids = plans.map(({ id }) => id), id = ids[index]!;
    ids.splice(index, 1);
    ids.splice(index + offset, 0, id);
    void send({ action: "reorder", ids }, "Order saved.");
    // At the top or bottom the pressed arrow is disabled, so the other one takes focus.
    const pressed = offset < 0 ? "up" : "down", other = offset < 0 ? "down" : "up";
    refocus.current = () => { const button = controlFor(`${id}:${pressed}`); return button && !button.disabled ? button : controlFor(`${id}:${other}`); };
  }
  function toggle(plan: SubscriptionPlanView) {
    if (inFlight.current || busy) return;
    void send({ action: plan.active ? "deactivate" : "activate", id: plan.id }, `${plan.name} ${plan.active ? "deactivated" : "activated"}.`);
    refocus.current = () => controlFor(`${plan.id}:toggle`) ?? document.getElementById("plan-list");
  }

  const notice = status && <Notice $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}</Notice>;
  const closeAdd = () => { if (!busy) setAdding(false); };
  function actions(plan: SubscriptionPlanView) {
    const index = plans.indexOf(plan);
    return <PlanActions data-record-actions>
      <Square id={controlId(`${plan.id}:up`)} type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${plan.name} up`}><ArrowUpIcon /></Square>
      <Square id={controlId(`${plan.id}:down`)} type="button" disabled={busy || index === plans.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${plan.name} down`}><ArrowDownIcon /></Square>
      <TextAction id={controlId(`${plan.id}:toggle`)} type="button" disabled={busy} onClick={() => toggle(plan)}>{plan.active ? "Deactivate" : "Activate"}</TextAction>
      <TextAction id={controlId(`${plan.id}:delete`)} type="button" $tone="danger" disabled={busy} aria-haspopup="dialog"
        onClick={() => { setStatus(null); setRemoving(plan); }}>Delete</TextAction>
    </PlanActions>;
  }

  return <RecordWorkspace $compact $detailOpen={detailOpen} aria-busy={busy || undefined} data-plans-workspace data-analytics-ignore>
    <RecordToolbar><h1>Plans</h1>
      <SearchBar label="Find a plan" value={search} disabled={busy} onChange={event => setSearch(event.target.value)}
        filters={{ label: "Advanced filters", dialogId: `${id}-filters`, open: filtersOpen, count: Number(planStatus !== "all"),
          onOpen: () => { setDraftStatus(planStatus); setFiltersOpen(true); } }}
        trailingAction={<RecordPrimaryAction id="add-plan-open" label="Add plan" icon={<PlusIcon />} disabled={busy} aria-haspopup="dialog"
          onClick={() => { setDraft(emptyDraft); setErrors({}); setStatus(null); setAdding(true); }} />} />
      {filtersOpen && <AdvancedFilterDialog id={`${id}-filters`} open closeLabel="Close plan filters" onCancel={() => setFiltersOpen(false)}
        onReset={() => setDraftStatus("all")} onApply={() => { setPlanStatus(draftStatus); setFiltersOpen(false); }}>
        <FloatingField label="Plan status"><select value={draftStatus} onChange={event => setDraftStatus(event.currentTarget.value)}>
          <option value="all">All plans</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select></FloatingField>
      </AdvancedFilterDialog>}
    </RecordToolbar>
    {notice && !adding && <RecordFeedback>{notice}</RecordFeedback>}
    <RecordList aria-label="Plan directory">
      <RecordListScroll id="plan-list" aria-label="Plan list" data-plans-list-scroll tabIndex={0}>
        {listedPlans.length ? listedPlans.map(plan => <li key={plan.id}>
          <RecordItem type="button" id={controlId(`${plan.id}:edit`)} data-plan-row={plan.id} disabled={busy}
            aria-current={selected?.id === plan.id ? "true" : undefined} aria-controls="plan-record-detail"
            onClick={event => {
              setSelectedId(plan.id); setStatus(null);
              if (editing?.id !== plan.id) setEditing(null);
              openDetail(event.currentTarget);
            }}>
            <RecordRowContent icon={<LayersIcon />} primary={<><RecordItemTitle>{plan.name}</RecordItemTitle>
              <Badge $tone={plan.active ? "good" : "muted"}>{plan.active ? "Active" : "Inactive"}</Badge></>}
              secondary={`${formatPlanLength(plan.durationDays)} · ${formatUgx(plan.priceUgx)}`} />
          </RecordItem>
        </li>) : <li><RecordEmpty><LayersIcon /><strong>{plans.length ? "No matching plans" : "No plans yet"}</strong></RecordEmpty></li>}
      </RecordListScroll>
      <RecordListFooter>{listedPlans.length} plan{listedPlans.length === 1 ? "" : "s"}</RecordListFooter>
    </RecordList>
    <RecordDetails id="plan-record-detail" aria-label="Plan details">
      <RecordBack onClick={closeEdit} disabled={busy}>Back to plans</RecordBack>
      <RecordCard key={selected?.id}>
        <RecordScroll tabIndex={0} data-plans-detail-scroll>
          {selected && activeEdit ? <>
            <RecordDetailHead><h2>{selected.name}</h2><Badge $tone={selected.active ? "good" : "muted"}>{selected.active ? "Active" : "Inactive"}</Badge></RecordDetailHead>
            <RecordBody>
              <EditForm id={`plan-edit-${selected.id}`} aria-label={`Edit ${selected.name}`} onSubmit={saveEdit} noValidate
                onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); closeEdit(); } }}>
                <PlanFields draft={activeEdit.draft} errors={activeEdit.errors} idPrefix={`edit-${selected.id}`} disabled={busy}
                  onChange={next => setEditing({ id: selected.id, draft: next, errors: {} })} />
                <Hint as="p">Existing codes and payments keep their original plan details.</Hint>
              </EditForm>
            </RecordBody>
          </> : <RecordEmpty><LayersIcon /><strong>Select a plan</strong></RecordEmpty>}
        </RecordScroll>
        {selected && <PlanFooter>
          <span data-record-summary>Order {plans.indexOf(selected) + 1} of {plans.length}</span>
          {actions(selected)}
          {dirty && <ActionButton type="button" disabled={busy} onClick={closeEdit}>Cancel</ActionButton>}
          <ActionButton id={`edit-${selected.id}-save`} type="submit" form={`plan-edit-${selected.id}`} $variant="primary" disabled={busy || !dirty}>Save plan</ActionButton>
        </PlanFooter>}
      </RecordCard>
    </RecordDetails>
    {adding && <RecordFormDialog id={`${id}-add`} title="Add a plan" submitLabel="Add plan" submitId="new-plan-submit" formId="new-plan-form" busy={busy} onClose={closeAdd}>
      <AddForm id="new-plan-form" onSubmit={create} noValidate aria-label="Add a plan">
        <Hint as="p">Every plan unlocks every feature. A day is 24 hours from payment confirmation.</Hint>
        <Presets role="group" aria-label="Fill from a preset">{presets.map(preset =>
          <ActionButton key={preset.name} type="button" disabled={busy} onClick={() => { setErrors({}); setDraft({ name: preset.name, durationDays: String(preset.days), priceUgx: String(preset.price) }); }}>{preset.name}</ActionButton>)}</Presets>
        <PlanFields draft={draft} errors={errors} onChange={setDraft} idPrefix="new" disabled={busy} hints />
        {notice}
      </AddForm>
    </RecordFormDialog>}
    {removing && <PlanDeleteDialog plan={removing} onClose={() => {
      const deletedId = removing.id;
      setRemoving(null);
      refocus.current = () => controlFor(`${deletedId}:delete`) ?? document.getElementById("plan-list");
    }} onDeleted={next => {
      const nextId = next[Math.min(plans.indexOf(removing), next.length - 1)]?.id ?? "";
      setPlans(next); setSelectedId(nextId); setEditing(null); setRemoving(null);
      if (!desktop) closeDetail();
      setStatus({ tone: "info", text: `${removing.name} deleted.` });
      refreshAdmin();
      refocus.current = () => (desktop && controlFor(`${nextId}:edit`)) || document.getElementById("plan-list");
    }} />}
  </RecordWorkspace>;
}

/** Name, days and price; the add form also shows the allowed ranges, which the edit form leaves to the server's errors. */
function PlanFields({ draft, errors, onChange, idPrefix, disabled, hints = false }: {
  draft: Draft; errors: Record<string, string>; onChange: (draft: Draft) => void; idPrefix: string; disabled: boolean; hints?: boolean;
}) {
  const hintText: Partial<Record<keyof Draft, string>> = hints ? {
    durationDays: `${planRules.durationDays.min}â€“${planRules.durationDays.max}; 1 is 24 hours`,
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
      <FieldBlock label={"Name"} description={<>{notes("name")}</>}><input {...field("name")} maxLength={planRules.nameMaxLength} autoComplete="off" required /></FieldBlock>
      <FieldBlock label={"Days"} description={<>{notes("durationDays")}</>}><input {...field("durationDays")} inputMode="numeric" autoComplete="off" required /></FieldBlock>
      <FieldBlock label={"Price (UGX)"} description={<>{notes("priceUgx")}</>}><input {...field("priceUgx")} inputMode="numeric" autoComplete="off" required /></FieldBlock>
      {errors.plan && <FieldError role="alert">{errors.plan}</FieldError>}
    </Fields>
  );
}

const PlanActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2);
`;
const PlanFooter = styled(RecordFooter)`
  ${media.belowDesktop} {
    flex-wrap: wrap; align-items: center; justify-content: flex-end;
    > * { flex: 0 0 auto; }
    > [data-record-summary] { flex: 1 0 100%; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  }
`;
/** Square arrows share the control metric with adjacent plan actions. */
const Square = styled.button`
  display: grid;
  place-items: center;
  inline-size: var(--form-control-height);
  block-size: var(--form-control-height);
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  cursor: pointer;
  > svg { font-size: var(--gh-font-title); }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; opacity: var(--gh-opacity-60); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { > svg { font-size: var(--gh-font-section); } }
`;
const EditForm = styled.form`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  ${media.belowDesktop} { padding: var(--gh-spacing-3) ${({ theme }) => theme.layout.sectionPadding}; }
`;
/** Two columns with the name across both; the edit form puts all three side by side in a wide list. */
const Fields = styled.div<{ $edit: boolean }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-3) var(--gh-spacing-2_5);
  min-inline-size: 0;
  > :first-child, > [role="alert"] { grid-column: 1 / -1; }
  ${({ theme, $edit }) => $edit && `@container (min-width: ${theme.viewport[34]}) { grid-template-columns: repeat(3, minmax(0, 1fr)); > :first-child { grid-column: auto; } }`}
`;
const AddForm = styled.form`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
`;
const Presets = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gh-spacing-2);
  > button { padding-inline: var(--gh-spacing-1_5); }
`;
