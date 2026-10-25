"use client";

import { useCallback, useState } from "react";
import styled from "styled-components";
import { teamInitials } from "@/domain/match-card";
import { deferImage } from "@/components/ui/deferred-image";
import { providerImageSource } from "@/components/ui/provider-image";
/** Containers may set --gh-logo-size; 32px remains the reserved default. --gh-logo-ring outlines the initials only, and
 * --gh-logo-fill and --gh-logo-ink colour their disc (the phone tiles keep it light in both themes).
 * `data-team-logo` lets a container's grid place the box. */
const LogoBox = styled.span<{ $loaded: boolean }>`
  display: grid;
  flex-shrink: 0;
  place-items: center;
  position: relative;
  inline-size: var(--gh-logo-size, 32px);
  block-size: var(--gh-logo-size, 32px);
  border-radius: var(--gh-logo-radius, 0);
  color: var(--gh-logo-ink, ${({ theme }) => theme.color.mutedText});
  background: ${({ theme, $loaded }) => $loaded ? "transparent" : `var(--gh-logo-fill, ${theme.color.surfaceMuted})`};
  box-shadow: ${({ $loaded }) => $loaded ? "none" : "var(--gh-logo-ring, none)"};
  font-size: var(--gh-logo-font, ${({ theme }) => theme.typography.size.small});
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1;
`;
const LogoImage = styled.img<{ $loaded: boolean }>`
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  opacity: ${({ $loaded }) => $loaded ? 1 : 0};
`;

export function TeamLogo({ name, url, eager, size = 32 }: { name: string | null; url: string | undefined; eager: boolean; size?: number }) {
  const source = url ? providerImageSource(url, size) : undefined;
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>();
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const loaded = Boolean(url && loadedUrl === url), failed = Boolean(url && failedUrl === url);
  const imageRef = useCallback((element: HTMLImageElement | null) => {
    if (!element || !url || !source) return;
    if (!eager) return deferImage(element, source);
    if (element.complete) {
      if (element.naturalWidth > 0) setLoadedUrl(url);
      else setFailedUrl(url);
    }
  }, [eager, source, url]);
  return <LogoBox aria-hidden="true" data-team-logo="" $loaded={loaded}>
    <span hidden={loaded}>{teamInitials(name)}</span>
    {url && !failed && <LogoImage ref={imageRef} src={eager ? source : undefined} data-logo-src={eager ? undefined : source} alt="" width={size} height={size}
      loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "auto" : "low"} decoding="async" referrerPolicy="no-referrer" $loaded={loaded}
      onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)} />}
  </LogoBox>;
}

