"use client";

import Image from "next/image";
import styled from "styled-components";
import type { MobileNetwork } from "@/domain/phone";

const artwork = {
  mtn: { src: "/payment-networks/mtn-momo.png", width: 628, height: 294 },
  airtel: { src: "/payment-networks/airtel-money.svg", width: 55, height: 57 },
} as const;

const Frame = styled.span`
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  inline-size: 76px; block-size: 44px; padding: 6px; background: #fff;
  img { display: block; inline-size: 100%; block-size: 100%; object-fit: contain; }
`;

/** Original provider artwork; adjacent text names the payment network. */
export function MobileMoneyLogo({ network }: { network: MobileNetwork }) {
  return <Frame aria-hidden="true" data-payment-logo={network}><Image {...artwork[network]} unoptimized alt="" /></Frame>;
}
