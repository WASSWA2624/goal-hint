"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { compactHeaderControl, compactHeaderIconControl } from "@/components/ui/header-controls";
import { DownloadIcon } from "@/components/ui/icons";
import { appDownloadsHref, isNewerAppRelease } from "@/domain/app-downloads";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { useAppDownloads } from "./app-downloads-provider";

const DownloadLink = styled(Link)`
  ${compactHeaderIconControl}
  color: ${({ theme }) => theme.header.accent};
  background: ${({ theme }) => theme.action.headerBackground};
  text-decoration: none;
  > span { display: none; }
  ${media.desktop} { ${compactHeaderControl} inline-size: auto; > span { display: inline; } }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
`;

export function DownloadHeaderLink({ locale }: { locale: string }) {
  const downloads = useAppDownloads();
  if (!downloads) return null;
  const { native, catalog } = downloads;
  const release = native && catalog.releases.find(candidate => candidate.platform === native.platform);
  if (native && (!release || native.channel !== catalog.channel || !isNewerAppRelease(release, native))) return null;
  const label = createMessages(locale).text(native ? "downloads.update" : "downloads.header");
  return <DownloadLink href={appDownloadsHref(locale)} prefetch={false} aria-label={label} title={label} data-header-download>
    <DownloadIcon /><span>{label}</span>
  </DownloadLink>;
}
