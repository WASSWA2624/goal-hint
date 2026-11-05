"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { controlRow } from "@/components/ui/control-layout";
import { ChevronRightIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { media } from "@/styles/theme";

const Selection = styled.div`
  display: grid;
  gap: var(--gh-spacing-4);
  min-inline-size: 0;
`;
const EmptyState = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-reading);
  line-height: var(--gh-leading-reading);
`;
const Packages = styled.fieldset`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  ${media.desktop} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
const Package = styled.label`
  display: grid;
  grid-template-columns: var(--gh-size-4_5) minmax(0, 1fr);
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  padding: var(--gh-spacing-3);
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  cursor: pointer;
  input {
    inline-size: var(--gh-size-4_5);
    block-size: var(--gh-size-4_5);
    min-block-size: var(--gh-size-4_5);
    margin: 0;
    accent-color: ${({ theme }) => theme.color.link};
    cursor: inherit;
  }
  &:has(input:checked) {
    border-color: ${({ theme }) => theme.color.link};
    background: ${({ theme }) => theme.color.brandSoft};
    box-shadow: inset 0 0 0 ${({ theme }) => theme.border.thin} ${({ theme }) => theme.color.link};
  }
  &:has(input:focus-visible) {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  &:has(input:disabled) { opacity: var(--gh-opacity-55); cursor: not-allowed; }
  ${media.hover} {
    &:has(input:not(:disabled)):hover { border-color: ${({ theme }) => theme.color.link}; }
  }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) var(--gh-size-4_5);
    grid-template-rows: auto auto;
    align-items: start;
    gap: var(--gh-spacing-2);
    input { grid-column: 2; grid-row: 1; margin-block-start: var(--gh-spacing-0_5); }
  }
`;
const PackageBody = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  ${media.desktop} { display: contents; }
`;
const PackageDetails = styled.span`
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  strong { min-inline-size: 0; font-size: var(--gh-font-section); line-height: var(--gh-leading-heading); overflow-wrap: anywhere; }
  small { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-reading); white-space: nowrap; }
  ${media.desktop} { grid-column: 1; grid-row: 1; }
`;
const Price = styled.strong`
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-end;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  max-inline-size: 100%;
  margin-inline-start: auto;
  font-size: var(--gh-font-heading);
  line-height: var(--gh-leading-heading);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  small { font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { grid-column: 1 / -1; grid-row: 2; justify-content: flex-start; margin-inline-start: 0; font-size: var(--gh-font-headline); }
`;
const Footer = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding-block-start: var(--gh-spacing-4);
  border-block-start: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  ${controlRow}
  > button { inline-size: 100%; }
  svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); flex: none; }
  ${media.desktop} { grid-template-columns: minmax(0, 1fr) auto; }
`;
const Summary = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  margin: 0;
  font-size: var(--gh-font-emphasis);
  line-height: var(--gh-leading-reading);
  overflow-wrap: anywhere;
  > span { display: grid; gap: var(--gh-spacing-1); color: ${({ theme }) => theme.color.mutedText}; }
  > span:only-child { grid-column: 1 / -1; }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > strong { font-size: var(--gh-font-section); white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

/** Package selection remains independent of payment methods and checkout validation. */
export function PackageSelection({ plans, selectedPlanId, disabled, onSelect, onContinue }: {
  plans: readonly SubscriptionPlanView[];
  selectedPlanId: string;
  disabled: boolean;
  onSelect: (planId: string) => void;
  onContinue: () => void;
}) {
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
  return <Selection data-package-selection>
    {plans.length > 0 ? <Packages disabled={disabled}>
      <VisuallyHidden as="legend">Packages</VisuallyHidden>
      {plans.map(plan => <Package key={plan.id}>
        <input type="radio" name="checkout-package" value={plan.id} checked={plan.id === selectedPlanId}
          disabled={disabled} onChange={() => onSelect(plan.id)} />
        <PackageBody>
          <PackageDetails><strong>{plan.name}</strong><small>{formatPlanLength(plan.durationDays)}</small></PackageDetails>
          <Price><small>UGX</small><span>{formatUgx(plan.priceUgx).slice(4)}</span></Price>
        </PackageBody>
      </Package>)}
    </Packages> : <EmptyState role="status">No packages are available right now.</EmptyState>}
    <Footer>
      <Summary aria-live="polite">{selectedPlan ? <>
        <span><span>Selected package</span><strong>{selectedPlan.name} · {formatPlanLength(selectedPlan.durationDays)}</strong></span>
        <strong>{formatUgx(selectedPlan.priceUgx)}</strong>
      </> : <span>Select a package to continue.</span>}</Summary>
      <Button type="button" disabled={disabled || !selectedPlan} onClick={onContinue}>Continue to Pay<ChevronRightIcon /></Button>
    </Footer>
  </Selection>;
}
