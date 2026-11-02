"use client";

import styled from "styled-components";
import Image from "next/image";
import { knownCountryCode, countryShortName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";

const Label = styled.span`
  display: inline-flex; align-items: center; justify-content: inherit; gap: var(--gh-spacing-1);
  max-inline-size: 100%; vertical-align: middle;
  > img { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-3); object-fit: contain; }
  > span { overflow-wrap: anywhere; }
`;

/** Shared local flags and football country codes; unknown countries retain their supplied name. */
export function CountryLabel({ country }: { country: string | null | undefined }) {
  if (!country) return null;
  const flag = countryFlagAsset(country);
  return <Label data-country-label title={country} aria-label={country}>
    {flag && <Image src={flag} alt="" width={16} height={12} unoptimized />}<span>{knownCountryCode(country) || countryShortName(country)}</span>
  </Label>;
}
