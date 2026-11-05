"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { formatPlanLength, formatUgx, type PlanUsage, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { CheckField, DangerButton, Hint, postAdmin, replyMessage, Requirements } from "./admin-form";

function readUsage(value: unknown): PlanUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as PlanUsage;
  return [usage.payments, usage.accessCodes, usage.autoRenewals].every(count => Number.isSafeInteger(count) && count >= 0) ? usage : null;
}

/** Preview references before confirmation; the server rechecks them under its deletion lock. */
export function PlanDeleteDialog({ plan, onClose, onDeleted }: {
  plan: SubscriptionPlanView; onClose: () => void; onDeleted: (plans: readonly SubscriptionPlanView[]) => void;
}) {
  const id = useId(), router = useRouter();
  const inFlight = useRef(false);
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [checking, setChecking] = useState(true), [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = checking || deleting;
  const inUse = !!usage && usage.payments + usage.accessCodes + usage.autoRenewals > 0;

  useEffect(() => {
    let current = true;
    void postAdmin("/api/admin/plans", { action: "usage", id: plan.id }).then(reply => {
      if (!current) return;
      setChecking(false);
      if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
      const next = reply.ok ? readUsage(reply.body.usage) : null;
      setUsage(next);
      if (!next) setError(replyMessage(reply, "Linked records could not be checked. Please retry."));
    });
    return () => { current = false; };
  }, [plan.id, attempt, router]);

  async function remove() {
    if (inFlight.current || busy || !usage || inUse || !confirmed) return;
    inFlight.current = true;
    setDeleting(true); setError(null);
    const reply = await postAdmin("/api/admin/plans", { action: "delete", id: plan.id, confirmed: true });
    if (reply.ok && Array.isArray(reply.body.plans)) {
      onDeleted(reply.body.plans as SubscriptionPlanView[]);
      return;
    }
    inFlight.current = false;
    setDeleting(false);
    if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
    const next = readUsage(reply.body.usage);
    if (next) { setUsage(next); setConfirmed(false); }
    setError(replyMessage(reply, "The plan could not be deleted. Please retry."));
  }

  return <CriteriaDialog id={id} title="Delete plan" open closeLabel="Close delete plan" onCancel={onClose} busy={busy}
    footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</CriteriaDialogButton>
      <DangerButton type="button" disabled={busy || !usage || inUse || !confirmed} onClick={() => void remove()}>Delete plan</DangerButton></>}>
    <Content>
      <div><strong>{plan.name}</strong><Hint as="p">{formatPlanLength(plan.durationDays)} · {formatUgx(plan.priceUgx)}</Hint></div>
      {checking && <Hint as="p" role="status">Checking linked records…</Hint>}
      {usage && <>
        <Requirements aria-label="Linked records">
          <li>{usage.payments} payment record{usage.payments === 1 ? "" : "s"}</li>
          <li>{usage.accessCodes} access code{usage.accessCodes === 1 ? "" : "s"}</li>
          <li>{usage.autoRenewals} automatic renewal{usage.autoRenewals === 1 ? "" : "s"}</li>
        </Requirements>
        {inUse ? <Hint as="p">This plan has linked records. Deactivate it to stop new purchases while preserving its history.</Hint>
          : <><p>This permanently removes the plan from the catalogue. This cannot be undone.</p>
            <CheckField><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
              <span>Permanently delete {plan.name}.</span></CheckField></>}
      </>}
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      {!checking && !usage && <CriteriaDialogButton type="button" variant="secondary" onClick={() => {
        setError(null); setChecking(true); setAttempt(value => value + 1);
      }}>Retry check</CriteriaDialogButton>}
    </Content>
  </CriteriaDialog>;
}

const Content = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  overflow-wrap: anywhere;
  p { margin: 0; }
`;
