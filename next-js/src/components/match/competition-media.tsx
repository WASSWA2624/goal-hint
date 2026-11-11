"use client";

import { useCallback, useState } from "react";
import styled from "styled-components";
import { deferImage } from "@/components/ui/deferred-image";
import { GlobeIcon } from "@/components/ui/icons";
import { providerImageSource } from "@/components/ui/provider-image";
import { knownCountryCode } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { FlagIcon, TrophyIcon } from "./match-icons";

const LeagueMark = styled.span`
  display: inline-grid;
  place-items: center;
  flex: none;
  inline-size: var(--gh-league-mark-size, var(--gh-size-4));
  block-size: var(--gh-league-mark-size, var(--gh-size-4));
  color: ${({ theme }) => theme.color.mutedText};
  > img, > svg { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; object-fit: contain; }
`;

const FlagMark = styled.span`
  display: inline-grid;
  place-items: center;
  flex: none;
  inline-size: var(--gh-flag-width, var(--gh-size-4_5));
  block-size: var(--gh-flag-height, var(--gh-size-3));
  > img, > svg { inline-size: 100%; block-size: 100%; object-fit: contain; }
`;
const MediaImage = styled.img<{ $visible?: boolean }>`
  opacity: ${({ $visible }) => $visible === false ? 0 : 1};
`;

/** Keep the league icon slot stable and defer crest work until its row is visible. */
export function CompetitionLogo({ country, url, size = 16, eager = false }: {
  country: string | null | undefined; url: string | null | undefined; size?: number; eager?: boolean;
}) {
  const original = isSafeRemoteImageUrl(url) ? url : undefined;
  const optimized = original ? providerImageSource(original, size) : undefined;
  const [failed, setFailed] = useState<{ original: string; source: string } | null>(null);
  const [loaded, setLoaded] = useState<string>();
  const failedSource = failed?.original === original ? failed?.source : undefined;
  const source = failedSource === original ? undefined : failedSource === optimized ? original : optimized;
  const image = useCallback((element: HTMLImageElement | null) => {
    if (!element || !source || !original) return;
    if (!eager) return deferImage(element, source);
    if (element.complete) {
      if (element.naturalWidth > 0) setLoaded(source);
      else setFailed({ original, source });
    }
  }, [eager, original, source]);
  const visible = source !== undefined && source === loaded;
  const global = knownCountryCode(country) === "INT";
  return <LeagueMark data-competition-logo aria-hidden="true">
    {!visible && (global ? <GlobeIcon data-world-icon /> : <TrophyIcon />)}
    {source && original && <MediaImage key={source} ref={image} src={eager ? source : undefined}
      data-logo-src={eager ? undefined : source} alt="" width={size} height={size}
      loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
      $visible={visible} onLoad={() => setLoaded(source)} onError={() => setFailed({ original, source })} />}
  </LeagueMark>;
}

export function CompetitionCountryFlag({ country, url, offline = false }: {
  country: string | null | undefined; url?: string | null | undefined; offline?: boolean;
}) {
  const global = knownCountryCode(country) === "INT";
  const local = offline || global ? null : countryFlagAsset(country);
  const remote = !offline && !global && isSafeRemoteImageUrl(url) ? url : null;
  const [failed, setFailed] = useState<readonly string[]>([]);
  const source = [local, remote].find((candidate) => candidate && !failed.includes(candidate));
  return <FlagMark data-country-flag aria-hidden="true">
    {source ? <MediaImage key={source} src={source} alt="" width={18} height={12} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setFailed((previous) => [...previous, source])} />
      : global ? <GlobeIcon data-world-icon /> : <FlagIcon />}
  </FlagMark>;
}
