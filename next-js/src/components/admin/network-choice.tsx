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
  gap: 6px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  > legend {
    margin-block-end: 6px;
    padding: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  &:disabled { opacity: 0.6; }
  &:disabled label { cursor: not-allowed; }
`;

const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-inline-size: 0;
`;

const Choice = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 44px;
  padding: 6px 8px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface};
  color: ${({ theme }) => theme.color.text};
  font-size: 0.75rem;
  line-height: 1.25;
  cursor: pointer;
  > input {
    flex: none;
    inline-size: 14px;
    block-size: 14px;
    margin: 0;
    accent-color: ${({ theme }) => theme.color.link};
  }
  > input:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  > span { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-inline-size: 0; }
  > span > span:last-child { overflow-wrap: anywhere; }
  [data-payment-logo] { inline-size: 30px; block-size: 22px; }
  &:has(> input:checked) { border-color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
  &:hover:has(> input:not(:disabled)) { border-color: ${({ theme }) => theme.color.link}; }
`;
