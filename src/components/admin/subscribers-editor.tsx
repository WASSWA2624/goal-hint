"use client";
import { useState } from "react";
import { Muted, Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/controls";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, FieldBlock, FieldRow, FormStack } from "./admin-form";
import { CodeReadyPanel } from "./code-ready";
import { CodeActions, ManualCodeForm, useCodeAction } from "./code-tools";
export function SubscribersEditor({ owner, accounts, detail, plans }: { owner: string; accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const action = useCodeAction(owner), [found, setFound] = useState<readonly OwnerAccount[] | null>(null), [search, setSearch] = useState("");
  const path = detail ? `/api/admin/subscribers/${detail.id}` : "/api/admin/subscribers";
  return <div data-analytics-ignore><CodeReadyPanel owner={owner} immediate={action.delivery} done={action.clear} />{action.message && <Notice $tone="error" role="alert">{action.message}</Notice>}
    <Panel><form method="post" action="/api/admin/subscribers" onSubmit={async e => { e.preventDefault(); const r = await action.send("/api/admin/subscribers", { search }); if (r.ok) setFound(r.body.accounts as OwnerAccount[]); }}><FieldRow><PhoneInput label="Search by phone" value={search} onValueChange={setSearch} /><ActionButton disabled={action.busy}>Search</ActionButton></FieldRow></form>
      {(found ?? accounts).map(a => <p key={a.id}><a href={`/admin/subscribers?accountId=${a.id}`}>{a.phone ? formatPhone(a.phone) : "Erased account"}</a> · {a.status}</p>)}</Panel>
    {detail && <><Panel><PanelHeader><h2>{detail.phone ? formatPhone(detail.phone) : "Erased account"}</h2></PanelHeader><p>{detail.erasedAt ? "Erased" : detail.blockedAt ? "Blocked" : detail.codes.some(c => c.status === "active") ? "Active access" : detail.codes.some(c => c.status === "queued") ? "Queued access" : "No current access"} · {detail.unlocks} unlocks in the last 30 days</p>{detail.blockedReason && <p>{detail.blockedReason}</p>}
      {!detail.erasedAt && <FormStack><ActionButton type="button" disabled={action.busy} onClick={() => void action.send(path, { action: "sign-out-all" })}>Sign out all devices</ActionButton>
        <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: detail.blockedAt ? "unblock" : "block", value: new FormData(e.currentTarget).get("reason") }); }}><FieldBlock>Reason<input name="reason" required maxLength={200} /></FieldBlock><ActionButton disabled={action.busy}>{detail.blockedAt ? "Unblock" : "Block"}</ActionButton></form>
        <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: "note", value: new FormData(e.currentTarget).get("note") }); }}><FieldBlock>Owner note<textarea key={detail.ownerNote} name="note" maxLength={500} defaultValue={detail.ownerNote ?? ""} /></FieldBlock><ActionButton disabled={action.busy}>Save note</ActionButton></form>
      </FormStack>}
    </Panel><Panel><PanelHeader><h2>Unlocked devices ({detail.devices.length})</h2></PanelHeader>{detail.devices.map((d,i) => <p key={i}>Device {i+1} · last seen {formatPeriodEnd(new Date(d.lastSeenAt))}</p>)}{!detail.devices.length && <Muted>No unlocked devices.</Muted>}</Panel>
    <Panel><PanelHeader><h2>Codes</h2></PanelHeader>{detail.codes.map(c => <FormStack key={c.id}><p>{c.reference} · {c.planName} · {c.status} · {c.daysLeft} days left</p><p>Until {formatPeriodEnd(new Date(c.endsAt))}</p>{!detail.erasedAt && <CodeActions code={c} action={action} />}</FormStack>)}</Panel>
    <Panel><PanelHeader><h2>Payment submissions</h2></PanelHeader>{detail.submissions.map(p => <p key={p.id}><a href={`/admin/payments?tab=${p.status === "approved" || p.status === "reversed" ? "approved" : p.status === "rejected" ? "rejected" : "pending"}#${p.id}`}>{p.reference}</a> · {p.status} · {p.planName} · UGX {(p.amountReceivedUgx ?? p.claimedAmountUgx).toLocaleString("en-UG")}</p>)}</Panel>
    {!detail.erasedAt && <><Panel><PanelHeader><h2>Generate code</h2></PanelHeader><ManualCodeForm plans={plans} action={action} phone={detail.phone ?? ""} /></Panel>
    <Panel><PanelHeader><h2>Change number</h2></PanelHeader><Muted>First verify the request from the old number or against the payment details. Remaining access moves to a new code; old sessions lose access.</Muted>
      <form method="post" action={path} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void action.send(path, { action: "change-number", newPhone: f.get("newPhone"), verifiedBy: f.get("verifiedBy"), confirmed: f.get("confirmed") === "on" }); }}><FormStack><PhoneInput label="New phone number" name="newPhone" required /><FieldBlock>Verified by<select name="verifiedBy" required><option value="">Choose how you verified</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock><label><input type="checkbox" name="confirmed" required /> I verified this request.</label><ActionButton disabled={action.busy}>Change number and generate code</ActionButton></FormStack></form>
    </Panel><Panel><PanelHeader><h2>Erase personal data</h2></PanelHeader><Muted>This clears numbers, notes, sessions and screenshots. Payment amounts, IDs and code history remain for accounting. This cannot be undone.</Muted>
      <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: "erase", confirmed: new FormData(e.currentTarget).get("confirmed") === "on" }); }}><FormStack><label><input type="checkbox" name="confirmed" required /> I verified the account and want to erase its personal data.</label><ActionButton disabled={action.busy}>Erase personal data</ActionButton></FormStack></form>
    </Panel></>}
    </>}
  </div>;
}
