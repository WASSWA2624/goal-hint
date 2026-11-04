"use client";

import { useId, useState } from "react";
import styled from "styled-components";
import { AlertIcon } from "@/components/ui/icons";
import { paymentRejectionLabels, paymentRejectionMaxLength, paymentRejectionReasons, paymentRejectionText, type PaymentRejectionReason } from "@/domain/payment-rejection";
import { CheckField, DangerButton, FieldBlock, FormStack } from "./admin-form";
import { PaymentActionDialog, PaymentDialogCancel } from "./payment-action-dialog";

const Reasons = styled.fieldset`
  margin: 0;
  padding: 0;
  border: 0;
  min-inline-size: 0;
  legend { padding: 0; font-weight: var(--gh-weight-medium); }
`;

export type PaymentRejection = {
  presets: PaymentRejectionReason[];
  note: string;
  text: string;
  deleteImage: boolean;
};

export function PaymentRejectionDialog({ busy, error, canDeleteImage = false, onCancel, onReject }: {
  busy: boolean; error?: string; canDeleteImage?: boolean; onCancel: () => void; onReject: (rejection: PaymentRejection) => void;
}) {
  const formId = useId();
  const [checked, setChecked] = useState<PaymentRejectionReason[]>([]);
  const [note, setNote] = useState(""), [deleteImage, setDeleteImage] = useState(false);
  const presets = paymentRejectionReasons.filter(reason => checked.includes(reason));
  const needsNote = !presets.length || presets.includes("other");
  const text = paymentRejectionText(presets, note);
  const tooLong = note.trim().length >= 3 && !text;

  return <PaymentActionDialog title={<><AlertIcon />Reject payment</>} busy={busy} dismissOnEscape={false}
    onClose={onCancel} closeLabel="Close rejection dialog" footer={<>
      <PaymentDialogCancel type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</PaymentDialogCancel>
      <DangerButton type="submit" form={formId} disabled={busy || !text}>Reject</DangerButton>
    </>}>
      <form id={formId} onSubmit={event => {
        event.preventDefault();
        if (!busy && text) onReject({ presets, note: note.trim(), text, deleteImage });
      }}>
        <FormStack>
          <Reasons disabled={busy}><legend>Rejection reasons</legend>
            {paymentRejectionReasons.map(reason => <CheckField key={reason}>
              <input type="checkbox" checked={checked.includes(reason)} onChange={event => {
                const selected = event.target.checked;
                setChecked(current => selected ? [...current, reason] : current.filter(value => value !== reason));
              }} />{paymentRejectionLabels[reason]}
            </CheckField>)}
          </Reasons>
          <FieldBlock label={needsNote ? "Explanation" : "Explanation · optional"}>
            <textarea rows={2} required={needsNote} minLength={3} maxLength={paymentRejectionMaxLength}
              value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
          </FieldBlock>
          {canDeleteImage && <CheckField><input type="checkbox" checked={deleteImage}
            onChange={event => setDeleteImage(event.target.checked)} disabled={busy} />Delete screenshot</CheckField>}
          {tooLong && <p role="alert">Keep the combined reasons and explanation within {paymentRejectionMaxLength} characters.</p>}
          {error && <p role="alert">{error}</p>}
        </FormStack>
      </form>
  </PaymentActionDialog>;
}
