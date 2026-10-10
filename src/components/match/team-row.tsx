"use client";

import { useCallback, useState } from "react";
import styled from "styled-components";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { teamInitials } from "@/domain/match-card";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages } from "@/i18n/messages";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export type TeamRowProps = {
  team: FixtureSnapshot["homeTeam"];
  side: "home" | "away";
  score: number | null;
  locale?: string;
  /** Use eager only for logos known to be above the fold. */
  eagerLogo?: boolean;
};

const Row = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) max-content;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  min-inline-size: 0;
`;
/** Containers may set --gh-logo-size; 32px remains the reserved default. */
const LogoBox = styled.span<{ $loaded: boolean }>`
  display: grid;
  flex-shrink: 0;
  place-items: center;
  position: relative;
  inline-size: var(--gh-logo-size, 32px);
  block-size: var(--gh-logo-size, 32px);
  border-radius: var(--gh-logo-radius, 0);
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme, $loaded }) => $loaded ? "transparent" : theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.size.small};
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
const NameBlock = styled.div`
  min-inline-size: 0;
  overflow-wrap: anywhere;
`;
const Side = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.size.small};
`;
const Name = styled.p`
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const Score = styled.span`
  min-inline-size: 2ch;
  text-align: end;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
`;

export function TeamLogo({ name, url, eager }: { name: string | null; url: string | undefined; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete) {
      if (element.naturalWidth > 0) setLoaded(true);
      else setFailed(true);
    }
  }, []);
  return <LogoBox aria-hidden="true" $loaded={loaded}>
    <span hidden={loaded}>{teamInitials(name)}</span>
    {url && !failed && <LogoImage ref={imageRef} src={url} alt="" width={32} height={32}
      loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" $loaded={loaded}
      onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />}
  </LogoBox>;
}

export function TeamRow({ team, side, score, locale, eagerLogo = false }: TeamRowProps) {
  const messages = createMessages(locale);
  const name = team.name?.trim() || messages.text(side === "home" ? "match.homeUnknown" : "match.awayUnknown");
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Row data-team-side={side}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eagerLogo} />
    <NameBlock><Side>{messages.text(`match.${side}`)}</Side><Name>{name}</Name></NameBlock>
    <Score>
      <VisuallyHidden>{messages.text(side === "home" ? "match.homeScore" : "match.awayScore")}: </VisuallyHidden>
      {score === null ? <><span aria-hidden="true">—</span><VisuallyHidden>{messages.text("match.scoreUnknown")}</VisuallyHidden></> : messages.number(score)}
    </Score>
  </Row>;
}
