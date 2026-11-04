"use client";

import { useId, useState } from "react";
import { AlertIcon } from "@/components/ui/icons";
import { paymentReversalLabels, paymentReversalNoteLimit, paymentReversalReasons, type PaymentReversalDetails, type PaymentReversalReason } from "@/domain/payment-reversal";
import { CheckField, DangerButton, FieldBlock, FormStack } from "./admin-form";
import { PaymentActionDialog, PaymentDialogCancel } from "./payment-action-dialog";

export function PaymentReversalDialog({ busy, error, topUp, onClose, onReverse }: {
  busy: boolean; error: string; topUp: boolean; onClose: () => void; onReverse: (details: PaymentReversalDetails) => void;
}) {
  const formId = useId();
  const [selected, setSelected] = useState<PaymentReversalReason[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const canReverse = selected.length > 0 && confirmed;
  return <PaymentActionDialog title={<><AlertIcon />Reverse payment</>} busy={busy} onClose={onClose}
    closeLabel="Close reversal dialog" dismissOnEscape={false} footer={<>
      <PaymentDialogCancel type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</PaymentDialogCancel>
      <DangerButton type="submit" form={formId} disabled={busy || !canReverse}>Reverse payment</DangerButton>
    </>}>
    <form id={formId} onSubmit={event => {
      event.preventDefault();
      if (busy || !canReverse) return;
      const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
      onReverse({ reasons: paymentReversalReasons.filter(reason => selected.includes(reason)), note });
    }}>
      <FormStack>
        <div role="group" aria-label="Reversal reasons">
          {paymentReversalReasons.map(reason => <CheckField key={reason}>
            <input type="checkbox" checked={selected.includes(reason)} disabled={busy} onChange={event => {
              const checked = event.target.checked;
              setSelected(current => checked ? [...current, reason] : current.filter(value => value !== reason));
            }} />{paymentReversalLabels[reason]}
          </CheckField>)}
        </div>
        <FieldBlock label="Custom reason · optional"><textarea name="note" maxLength={paymentReversalNoteLimit} rows={2} disabled={busy} /></FieldBlock>
        <CheckField><input type="checkbox" required checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />{topUp ? "Reverse the credit from this payment" : "End access from this payment"}</CheckField>
        {error && <p role="alert">{error}</p>}
      </FormStack>
    </form>
  </PaymentActionDialog>;
}
