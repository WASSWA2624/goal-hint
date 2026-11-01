"use client";
import { useId } from "react";
import styled from "styled-components";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import type { PaymentEvidenceWarning } from "@/domain/checkout-evidence";
import { CheckoutDialog } from "./checkout-parts";

export function PaymentEvidenceWarning({ warnings, onCancel, onContinue, onChangeMethod }: {
  warnings: readonly PaymentEvidenceWarning[]; onCancel: () => void; onContinue: () => void; onChangeMethod?: () => void;
}) {
  const id = useId();
  return <WarningDialog id={`${id}-evidence`} title="Confirm payment" open onCancel={onCancel} closeLabel="Close payment confirmation"
    footer={<><CriteriaDialogButton variant="secondary" title="Review payment details" onClick={onCancel}>Review</CriteriaDialogButton>
      {onChangeMethod && <CriteriaDialogButton variant="secondary" title="Change payment method" onClick={onChangeMethod}>Method</CriteriaDialogButton>}
      <CriteriaDialogButton title="Confirm these payment details" onClick={onContinue}>Confirm</CriteriaDialogButton></>}>
    {warnings.length === 1 ? <p>{warnings[0]!.message}</p> : <ul>{warnings.map(warning => <li key={warning.id}>{warning.message}</li>)}</ul>}
    <p>Review the details and confirm that you made this payment.</p>
  </WarningDialog>;
}
const WarningDialog = styled(CheckoutDialog)`
  > footer { flex-wrap: nowrap; }
  && > footer > button { flex: 1; min-inline-size: 0; padding-inline: 8px; white-space: nowrap; }
  ul { margin: 0 0 12px; padding-inline-start: 20px; }
  li + li { margin-block-start: 8px; }
  p { margin: 0; }
  p + p { margin-block-start: 12px; }
`;
