"use client";

import { useId } from "react";
import styled from "styled-components";

const Group = styled.fieldset`
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > legend { padding: 0; margin-block-end: 2px; color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; }
  > label { display: flex; align-items: center; gap: 5px; min-inline-size: 0; min-block-size: 24px;
    font-size: .75rem; line-height: 1.3; cursor: pointer; }
  input { flex: none; inline-size: 14px; block-size: 14px; margin: 0; accent-color: ${({ theme }) => theme.color.accent.blue.solid}; cursor: inherit; }
  input:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  span { min-inline-size: 0; overflow-wrap: anywhere; }
  input:checked + span { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;

/** Compact native radio choices: one labelled group with standard arrow-key behavior. */
export function RadioGroup<Value extends string | number>({ label, value, options, onChange }: {
  label: string; value: Value; options: readonly { value: Value; label: string }[]; onChange: (value: Value) => void;
}) {
  const name = useId();
  return <Group><legend>{label}</legend>
    {options.map(option => <label key={option.value}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </Group>;
}
