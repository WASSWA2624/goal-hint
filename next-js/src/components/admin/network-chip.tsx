"use client";

import styled from "styled-components";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export const networkLabel = (network: string) => network === "mtn" ? "MTN MoMo" : network === "airtel" ? "Airtel Money" : network.toUpperCase();

/**
 * The network's own artwork as a small chip; an unknown network falls back to its short name. The artwork is decorative:
 * pass `labelled` where no visible text names the network next to it.
 */
export function NetworkChip({ network, labelled = false }: { network: string; labelled?: boolean }) {
  return <>
    {network === "mtn" || network === "airtel" ? <NetworkMark><MobileMoneyLogo network={network} /></NetworkMark>
      : <NetworkText aria-hidden="true">{network.toUpperCase()}</NetworkText>}
    {labelled && <VisuallyHidden>{networkLabel(network)}</VisuallyHidden>}
  </>;
}

const NetworkMark = styled.span`
  display: inline-flex;
  flex: none;
  [data-payment-logo] { inline-size: 40px; block-size: 18px; border-radius: 2px; overflow: hidden; }
  [data-payment-logo="airtel"] { inline-size: 18px; }
`;
const NetworkText = styled.span`
  display: inline-flex;
  padding: 0 5px;
  border-radius: 2px;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.micro};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 18px;
`;
