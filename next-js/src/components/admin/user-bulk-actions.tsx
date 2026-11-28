"use client";

import { useId, useState, type FormEvent } from "react";
import { formatPhone } from "@/domain/phone";
import { userDirectoryPageSize, type UserDirectoryAccount } from "@/domain/user-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { authCopy } from "@/i18n/messages/auth";
import { ActionButton, DangerButton, FieldBlock, FormStack, postAdmin, type AdminReply } from "./admin-form";
import { ActionNotices, PlanField, type CodeAction } from "./code-tools";
import { UserReviewDialog } from "./user-review-dialog";
import { CompactForm, MutedText } from "./user-styles";

type BulkAction = "grant" | "block" | "unblock" | "sign-out-all" | "erase" | "delete";
type BulkChoice = Readonly<{ action: BulkAction; label: string; accounts: readonly UserDirectoryAccount[] }>;
export type UserBulkOperation = BulkChoice & Readonly<{ requestId: string }>;
export type UserBulkResult = Readonly<{ succeeded: number; failures: readonly { accountId: string; identity: string; message: string }[] }>;
type BulkRow = { accountId: string; status: "saved" | "failed"; message: string | undefined };
const bulkPath = "/api/admin/users/bulk";

const bulkChoices: readonly { action: BulkAction; label: string; accepts?: (account: UserDirectoryAccount) => boolean }[] = [
  { action: "grant", label: "Grant access", accepts: account => account.status !== "erased" },
  { action: "block", label: "Block accounts", accepts: account => account.status === "open" },
  { action: "unblock", label: "Unblock accounts", accepts: account => account.status === "blocked" },
  { action: "sign-out-all", label: authCopy.logoutDevices, accepts: account => account.status !== "erased" },
  { action: "erase", label: "Erase personal data", accepts: account => account.status !== "erased" },
  { action: "delete", label: "Permanently delete accounts" },
];

export function userBulkChoices(selected: readonly UserDirectoryAccount[]): BulkChoice[] {
  return bulkChoices.flatMap(({ accepts, action, label }) => {
    const accounts = accepts ? selected.filter(accepts) : selected;
    return accounts.length ? [{ action, label, accounts }] : [];
  });
}

function readBulkRows(value: unknown, accountIds: readonly string[]): BulkRow[] | null {
  if (!Array.isArray(value) || value.length !== accountIds.length) return null;
  const remaining = new Set(accountIds), rows: BulkRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.accountId !== "string"
      || !remaining.delete(row.accountId) || (row.status !== "saved" && row.status !== "failed")) return null;
    rows.push({ accountId: row.accountId, status: row.status, message: typeof row.message === "string" ? row.message : undefined });
  }
  return rows;
}

/** Keep the complete selection in one action while the server processes bounded requests. */
export async function postUserAction(path: string, body: unknown): Promise<AdminReply> {
  if (path !== bulkPath || !body || typeof body !== "object" || !("accountIds" in body)
    || !Array.isArray(body.accountIds) || body.accountIds.length <= userDirectoryPageSize) return postAdmin(path, body);

  const accountIds: string[] = body.accountIds, results: BulkRow[] = [];
  for (let offset = 0; offset < accountIds.length; offset += userDirectoryPageSize) {
    const batch = accountIds.slice(offset, offset + userDirectoryPageSize);
    const reply = await postAdmin(path, { ...body, accountIds: batch, count: batch.length });
    const rows = reply.ok ? readBulkRows(reply.body?.results, batch) : null;
    if (rows) {
      results.push(...rows);
      continue;
    }
    if (!offset) return reply;
    for (const [index, accountId] of accountIds.slice(offset).entries()) {
      results.push({ accountId, status: "failed", message: index < batch.length
        ? "The change could not be confirmed for this account. Refresh before trying again."
        : "The action stopped before reaching this account." });
    }
    break;
  }
  return { ok: true, status: 200, body: { results } };
}

function parseBulkResult(value: unknown, accounts: readonly UserDirectoryAccount[]): UserBulkResult | null {
  const targets = new Map(accounts.map(account => [account.id, account]));
  const rows = readBulkRows(value, [...targets.keys()]);
  if (!rows) return null;
  const failures: UserBulkResult["failures"][number][] = [];
  for (const row of rows) {
    if (row.status !== "failed") continue;
    const target = targets.get(row.accountId)!;
    failures.push({ accountId: target.id,
      identity: target.phone ? `+${formatPhone(target.phone)}` : `Erased account ${target.id}`,
      message: row.message ?? "The action was refused." });
  }
  return { succeeded: accounts.length - failures.length, failures };
}

export function UserBulkDialog({ operation, plans, action, onSuccess, onClose }: {
  operation: UserBulkOperation;
  plans: readonly SubscriptionPlanView[];
  action: CodeAction;
  onSuccess: (result: UserBulkResult) => void;
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
    const reply = await action.send(bulkPath, payload);
    if (!reply.ok) {
      if (reply.status === 400) setAttempt(null);
      return;
    }
    const result = parseBulkResult(reply.body?.results, accounts);
    if (result) onSuccess(result);
    else setInvalidResponse(true);
  }

  return <UserReviewDialog open title={label} busy={action.busy} onClose={onClose} footer={<>
    <ActionButton type="button" onClick={onClose} disabled={action.busy}>Cancel</ActionButton>
    <Submit type="submit" form={id} $variant="primary" disabled={!confirmed || action.busy}>{label}</Submit>
  </>}>
    <CompactForm id={id} onSubmit={submit} data-user-bulk-confirm>
      <MutedText>This action applies to <strong>{count} {count === 1 ? "account" : "accounts"}</strong> selected from the loaded list.</MutedText>
      {destructive && <MutedText>{kind === "delete"
        ? "Permanently deletes eligible accounts and linked records. Retained accounting and audit records may prevent deletion."
        : "Erases identifying data and signs out devices. Payment amounts and access history are retained."}</MutedText>}
      {kind === "block" && <MutedText>{authCopy.bulkBlockDevicesHelp}</MutedText>}
      {kind === "sign-out-all" && <MutedText>{authCopy.bulkDevicesLoginHelp}</MutedText>}
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
  </UserReviewDialog>;
}
