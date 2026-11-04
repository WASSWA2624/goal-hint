"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { AlertIcon } from "@/components/ui/icons";
import { paymentRejectionLabels, paymentRejectionMaxLength, paymentRejectionReasons, paymentRejectionText, type PaymentRejectionReason } from "@/domain/payment-rejection";
import { CheckField, DangerButton, FieldBlock, FormStack } from "./admin-form";

const Anchor = styled.div`display: contents;`;
const Dialog = styled(CriteriaDialog)`
  &&[data-enhanced="true"] {
    inset: auto;
    left: var(--rejection-x, 50%);
    top: var(--rejection-y, 50%);
    transform: translate(-50%, -50%);
    margin: 0;
    max-inline-size: calc(var(--rejection-width, 100vw) - var(--gh-size-6));
  }
  header h2 {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-2);
    font-weight: var(--gh-weight-medium);
  }
  header h2 svg { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const CancelButton = styled(CriteriaDialogButton)`margin-inline-end: auto;`;
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
  const anchor = useRef<HTMLDivElement>(null), id = useId(), formId = `${id}-form`;
  const [checked, setChecked] = useState<PaymentRejectionReason[]>([]);
  const [note, setNote] = useState(""), [deleteImage, setDeleteImage] = useState(false);
  const presets = paymentRejectionReasons.filter(reason => checked.includes(reason));
  const needsNote = !presets.length || presets.includes("other");
  const text = paymentRejectionText(presets, note);
  const tooLong = note.trim().length >= 3 && !text;

  useLayoutEffect(() => {
    const element = anchor.current, pane = element?.closest("#payment-review");
    if (!element || !pane) return;
    const position = () => {
      const bounds = pane.getBoundingClientRect();
      element.style.setProperty("--rejection-x", `${bounds.left + bounds.width / 2}px`);
      element.style.setProperty("--rejection-y", `${bounds.top + bounds.height / 2}px`);
      element.style.setProperty("--rejection-width", `${bounds.width}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(pane);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, []);

  return <Anchor ref={anchor}>
    <Dialog id={id} title={<><AlertIcon />Reject payment</>} open busy={busy} dismissOnEscape={false}
      onCancel={onCancel} closeLabel="Close rejection dialog" footer={<>
        <CancelButton type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</CancelButton>
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
    </Dialog>
  </Anchor>;
}
