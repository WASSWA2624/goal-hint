"use client";

import Image from "next/image";
import styled from "styled-components";
import type { MobileNetwork } from "@/domain/phone";

const artwork = {
  mtn: { src: "/payment-networks/mtn-momo.jpg", width: 557, height: 359,
    crop: { x: 80, y: 96, width: 397, height: 177 } },
  airtel: { src: "/payment-networks/airtel-money.svg", width: 55, height: 57 },
} as const;

const Frame = styled.span`
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  inline-size: 76px; block-size: 44px;
  img { display: block; inline-size: 100%; block-size: 100%; object-fit: contain; }
`;
const Crop = styled.span`
  position: relative; display: block; inline-size: 100%; overflow: hidden;
  img { position: absolute; max-inline-size: none; }
`;

/** Keep a tight yellow surround around MTN's mark, excluding the source image's checkered edges. */
export function MobileMoneyLogo({ network }: { network: MobileNetwork }) {
  const asset = artwork[network];
  const image = { src: asset.src, width: asset.width, height: asset.height, unoptimized: true };
  return <Frame aria-hidden="true" data-payment-logo={network}>{"crop" in asset
    ? <Crop style={{ aspectRatio: `${asset.crop.width} / ${asset.crop.height}` }}><Image {...image} alt="" style={{
      inlineSize: `${asset.width / asset.crop.width * 100}%`, blockSize: `${asset.height / asset.crop.height * 100}%`,
      insetInlineStart: `${-asset.crop.x / asset.crop.width * 100}%`, insetBlockStart: `${-asset.crop.y / asset.crop.height * 100}%`,
    }} /></Crop>
    : <Image {...image} alt="" />}</Frame>;
}
