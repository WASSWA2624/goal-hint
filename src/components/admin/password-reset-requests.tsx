"use client";

import { useState } from "react";
import { Muted, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { ActionNotices, useCodeAction } from "./code-tools";
import { PasswordReset, TemporaryPassword, type Revealed } from "./subscribers-editor";

export function PasswordResetRequests({ requests }: { requests: readonly Readonly<{ id: string; phone: string; requestedAt: string }>[] }) {
  const action = useCodeAction(), [revealed, setRevealed] = useState<Revealed | null>(null), [handled, setHandled] = useState<string[]>([]);
  const pending = requests.filter(request => !handled.includes(`${request.id}:${request.requestedAt}`));
  return <div data-analytics-ignore><ActionNotices action={action} />
    <p>Verify the member manually, generate a temporary password, and read it to them. Passwords are displayed here once and expire after 15 minutes.</p>
    {revealed && <TemporaryPassword value={revealed} done={() => setRevealed(null)} />}
    {pending.map(request => <Panel key={request.id}><PanelHeader><h2>+{formatPhone(request.phone)}</h2></PanelHeader>
      <p>Requested {formatPeriodEnd(new Date(request.requestedAt))}</p>
      <p><a href={`/admin/subscribers?accountId=${request.id}`}>View account</a> · <a href={`tel:+${request.phone}`}>Call member</a></p>
      <PasswordReset path={`/api/admin/subscribers/${request.id}`} action={action} reveal={value => { setRevealed({ ...value, phone: request.phone }); setHandled(current => [...current, `${request.id}:${request.requestedAt}`]); }} />
    </Panel>)}
    {!pending.length && <Muted>No pending password requests.</Muted>}
  </div>;
}
