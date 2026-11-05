"use client";
import type { ReactNode } from "react";
import { InputControl } from "./controls";
import { FloatingField } from "./floating-field";
import { preserveDigitCaret } from "./formatted-input";
import { deleteGroupedDigit, groupInteger, integerDigits } from "@/domain/input-format";

export function AmountInput({ label, value, onValueChange, disabled, required, hint }: {
  label: string; value: string; onValueChange: (value: string) => void; disabled?: boolean; required?: boolean;
  hint?: ReactNode;
}) {
  return <FloatingField label={label} hint={hint}><InputControl $invalid={false} type="text" inputMode="numeric" value={groupInteger(value)}
    disabled={disabled} required={required} autoComplete="off"
    onChange={event => {
      const control = event.currentTarget, before = integerDigits(control.value.slice(0, control.selectionStart ?? control.value.length)).length;
      onValueChange(integerDigits(control.value)); preserveDigitCaret(control, before);
    }} onKeyDown={event => {
      const control = event.currentTarget, edit = deleteGroupedDigit(control.value, control.selectionStart ?? 0, control.selectionEnd ?? 0, event.key);
      if (edit) { event.preventDefault(); onValueChange(integerDigits(edit.value)); preserveDigitCaret(control, edit.digitsBefore); }
    }} /></FloatingField>;
}
