"use client";

import { useId, useState, type FormEvent } from "react";
import { formatPhone } from "@/domain/phone";
import type { SubscriberDirectoryAccount } from "@/domain/subscriber-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, DangerButton, FieldBlock, FormStack } from "./admin-form";
import { ActionNotices, PlanField, type CodeAction } from "./code-tools";
import { SubscriberReviewDialog } from "./subscriber-review-dialog";
import { CompactForm, MutedText } from "./subscriber-styles";

type BulkAction = "grant" | "block" | "unblock" | "sign-out-all" | "erase" | "delete";
type BulkChoice = Readonly<{ action: BulkAction; label: string; accounts: readonly SubscriberDirectoryAccount[] }>;
export type SubscriberBulkOperation = BulkChoice & Readonly<{ requestId: string }>;
export type SubscriberBulkResult = Readonly<{ succeeded: number; failures: readonly { accountId: string; identity: string; message: string }[] }>;

const bulkChoices: readonly { action: BulkAction; label: string; accepts?: (account: SubscriberDirectoryAccount) => boolean }[] = [
  { action: "grant", label: "Grant access", accepts: account => account.status !== "erased" },
  { action: "block", label: "Block accounts", accepts: account => account.status === "open" },
  { action: "unblock", label: "Unblock accounts", accepts: account => account.status === "blocked" },
  { action: "sign-out-all", label: "Log out devices", accepts: account => account.status !== "erased" },
  { action: "erase", label: "Erase personal data", accepts: account => account.status !== "erased" },
  { action: "delete", label: "Permanently delete accounts" },
];

export function subscriberBulkChoices(selected: readonly SubscriberDirectoryAccount[]): BulkChoice[] {
  return bulkChoices.flatMap(({ accepts, action, label }) => {
    const accounts = accepts ? selected.filter(accepts) : selected;
    return accounts.length ? [{ action, label, accounts }] : [];
  });
}

function parseBulkResult(value: unknown, accounts: readonly SubscriberDirectoryAccount[]): SubscriberBulkResult | null {
  if (!Array.isArray(value) || value.length !== accounts.length) return null;
  const targets = new Map(accounts.map(account => [account.id, account]));
  const failures: SubscriberBulkResult["failures"][number][] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.accountId !== "string") return null;
    const target = targets.get(row.accountId);
    if (!target || !["saved", "failed"].includes(row.status)) return null;
    targets.delete(row.accountId);
    if (row.status === "failed") failures.push({ accountId: target.id,
      identity: target.phone ? `+${formatPhone(target.phone)}` : `Erased account ${target.id}`,
      message: typeof row.message === "string" ? row.message : "The action was refused." });
  }
  return { succeeded: accounts.length - failures.length, failures };
}

export function SubscriberBulkDialog({ operation, plans, action, onSuccess, onClose }: {
  operation: SubscriberBulkOperation;
  plans: readonly SubscriptionPlanView[];
  action: CodeAction;
  onSuccess: (result: SubscriberBulkResult) => void;
  onClose: () => void;
}) {
  const id = useId(), { accounts, action: kind, label, requestId } = operation;
  const [planId, setPlanId] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null), [invalidResponse, setInvalidResponse] = useState(false);
  const activePlans = plans.filter(plan => plan.active), count = accounts.length;
  const block = kind === "block" || kind === "unblock", grant = kind === "grant", destructive = kind === "delete" || kind === "erase";
  const Submit = destructive ? DangerButton : ActionButton;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || action.busy) return;
    const form = new FormData(event.currentTarget);
    const payload = attempt ?? {
      action: kind, accountIds: accounts.map(account => account.id), count, confirmed: true,
      ...(grant ? { requestId, ...(planId ? { planId } : { days: Number(form.get("days")) }), note: form.get("note") } : {}),
      ...(block ? { value: form.get("reason") } : {}),
    };
    if (grant) setAttempt(payload);
    setInvalidResponse(false);
    const reply = await action.send("/api/admin/subscribers/bulk", payload);
    if (!reply.ok) {
      if (reply.status === 400) setAttempt(null);
      return;
    }
    const result = parseBulkResult(reply.body.results, accounts);
    if (result) onSuccess(result);
    else setInvalidResponse(true);
  }

  return <SubscriberReviewDialog open title={label} busy={action.busy} onClose={onClose} footer={<>
    <ActionButton type="button" onClick={onClose} disabled={action.busy}>Cancel</ActionButton>
    <Submit type="submit" form={id} $variant="primary" disabled={!confirmed || action.busy}>{label}</Submit>
  </>}>
    <CompactForm id={id} onSubmit={submit} data-subscriber-bulk-confirm>
      <MutedText>This action applies to <strong>{count} {count === 1 ? "account" : "accounts"}</strong> selected on this page.</MutedText>
      {destructive && <MutedText>{kind === "delete"
        ? "Permanently deletes eligible accounts and linked records. Retained accounting and audit records may prevent deletion."
        : "Erases identifying data and signs out devices. Payment amounts and access history are retained."}</MutedText>}
      {kind === "block" && <MutedText>Blocking an account logs out its signed-in devices.</MutedText>}
      {kind === "sign-out-all" && <MutedText>Each account’s currently signed-in devices will need to log in again.</MutedText>}
      {grant && <FormStack>
        <MutedText>Grants access without recording a payment.</MutedText>
        <PlanField plans={activePlans} value="" disabled={action.busy || !!attempt} showPrice={false} onValueChange={setPlanId} />
        {!planId && <FieldBlock label="Custom days (1–366)"><input name="days" type="number" inputMode="numeric" min={1} max={366}
          defaultValue={1} required disabled={action.busy || !!attempt} /></FieldBlock>}
        <FieldBlock label="Reason for granting access"><textarea name="note" rows={2} required maxLength={200} disabled={action.busy || !!attempt} /></FieldBlock>
      </FormStack>}
      {block && <FieldBlock label="Reason"><input name="reason" required maxLength={200} disabled={action.busy} /></FieldBlock>}
      <label><input type="checkbox" checked={confirmed} required disabled={action.busy} onChange={event => setConfirmed(event.currentTarget.checked)} /> I confirm this action for {count} {count === 1 ? "account" : "accounts"}.</label>
      {action.message && <ActionNotices action={action} />}
      {invalidResponse && <p role="alert">The server returned an incomplete result. Refresh the directory to check the accounts.</p>}
    </CompactForm>
  </SubscriberReviewDialog>;
}
