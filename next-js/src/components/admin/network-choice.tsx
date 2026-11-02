"use client";

import { useState } from "react";
import styled from "styled-components";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import type { MobileNetwork } from "@/domain/phone";

export type NetworkChoiceValue = MobileNetwork | "";

type NetworkChoiceProps = {
  name?: string;
  label?: string;
  value?: NetworkChoiceValue;
  defaultValue?: NetworkChoiceValue;
  disabled?: boolean;
  onValueChange?: (value: NetworkChoiceValue) => void;
};

const networks = [
  { value: "", label: "None" },
  { value: "mtn", label: "MTN MoMo" },
  { value: "airtel", label: "Airtel Money" },
] as const;

/** Native radios retain keyboard and form behavior while displaying the shared provider artwork. */
export function NetworkChoice({ name = "network", label = "Payment provider", value, defaultValue = "", disabled = false, onValueChange }: NetworkChoiceProps) {
  const [selected, setSelected] = useState<NetworkChoiceValue>(defaultValue);
  const current = value ?? selected;
  return <Group disabled={disabled} data-network-choice>
    <legend>{label}</legend>
    <Choices>{networks.map(network => <Choice key={network.value}>
      <input type="radio" name={name} value={network.value} checked={current === network.value} onChange={() => {
        setSelected(network.value); onValueChange?.(network.value);
      }} />
      <span>{network.value && <MobileMoneyLogo network={network.value} />}<span>{network.label}</span></span>
    </Choice>)}</Choices>
  </Group>;
}

const Group = styled.fieldset`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  > legend {
    margin-block-end: var(--gh-spacing-1_5);
    padding: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  &:disabled { opacity: var(--gh-opacity-60); }
  &:disabled label { cursor: not-allowed; }
`;

const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
`;

const Choice = styled.label`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1_5) var(--gh-spacing-2);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surfaceMuted};
  color: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-heading);
  cursor: pointer;
  > input {
    flex: none;
    inline-size: var(--gh-size-3_5);
    block-size: var(--gh-size-3_5);
    margin: 0;
    accent-color: ${({ theme }) => theme.color.link};
  }
  > input:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  > span { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-1_5); min-inline-size: 0; }
  > span > span:last-child { overflow-wrap: anywhere; }
  [data-payment-logo] { inline-size: var(--gh-size-7_5); block-size: var(--gh-size-5_5); }
  &:has(> input:checked) {  background: ${({ theme }) => theme.color.brandSoft}; }
  &:hover:has(> input:not(:disabled)) { background: ${({ theme }) => theme.color.rowHover}; }
`;
