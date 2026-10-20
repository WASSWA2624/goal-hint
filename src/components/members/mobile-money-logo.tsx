"use client";

import styled from "styled-components";
import Image from "next/image";
import type { MobileNetwork } from "@/domain/phone";

/** Official remote artwork, unchanged; visible network names remain beside payment instructions. */
const artwork = {
  mtn: { src: "https://momoapi.mtn.com/content/momo_mtnb.png", width: 112, height: 54 },
  airtel: { src: "https://cdn-webportal.airtelstream.net/website/uganda/assets/icons/loadingLogo.svg", width: 32, height: 32 },
} as const;
const Frame = styled.span`
  display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center;
  padding: 10px; background: #fff; border-radius: 0;
  img { display: block; object-fit: contain; max-inline-size: 100%; }
`;

export function MobileMoneyLogo({ network }: { network: MobileNetwork }) {
  return <Frame aria-hidden="true" data-payment-logo={network}><Image {...artwork[network]} unoptimized alt=""
    style={{ width: artwork[network].width, height: "auto" }} referrerPolicy="no-referrer" /></Frame>;
}
