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
  return <WarningDialog id={`${id}-evidence`} title="Check payment evidence" open onCancel={onCancel} closeLabel="Close evidence warning"
    footer={<><CriteriaDialogButton variant="secondary" onClick={onCancel}>Review details</CriteriaDialogButton>
      {onChangeMethod && <CriteriaDialogButton variant="secondary" onClick={onChangeMethod}>Change method</CriteriaDialogButton>}
      <CriteriaDialogButton onClick={onContinue}>Continue for admin review</CriteriaDialogButton></>}>
    <ul>{warnings.map(warning => <li key={warning.id}>{warning.message}</li>)}</ul>
    <p>You can correct the details or continue. The admin must review these differences and verify the transfer before approval.</p>
  </WarningDialog>;
}
const WarningDialog = styled(CheckoutDialog)`
  > footer { flex-wrap: wrap; }
  ul { margin: 0 0 12px; padding-inline-start: 20px; }
  li + li { margin-block-start: 8px; }
  p { margin: 0; }
`;
