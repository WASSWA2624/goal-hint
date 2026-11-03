"use client";

import { useState } from "react";
import styled from "styled-components";
import { appPlatforms, type AppPlatform } from "@/domain/app-downloads";
import { Button, ButtonLink, TextLink } from "@/components/ui/controls";
import { AndroidIcon, CheckIcon, DownloadIcon, WindowsIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/brand";
import { PageHeading, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { homeHref } from "@/domain/navigation";
import { useAppDownloads } from "./app-downloads-provider";

const Page = styled.section`
  max-inline-size: ${({ theme }) => theme.layout.formMaxWidth};
  margin-inline: auto;
  padding-block: ${({ theme }) => theme.space.lg};
  min-inline-size: 0;
  h1 { margin-block: 0; }
  p { margin-block: 0; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Hero = styled.header`
  display: grid;
  justify-items: start;
  gap: ${({ theme }) => theme.space.sm};
  text-align: start;
`;
const TitleRow = styled.div`
  display: flex;
  min-inline-size: 0;
  max-inline-size: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: ${({ theme }) => theme.space.sm};
  > span { padding: 0; }
  > h1 { min-inline-size: 0; }
`;
const Platforms = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;
const PlatformButton = styled(Button)`
  && {
    position: relative;
    display: grid;
    justify-items: center;
    gap: ${({ theme }) => theme.space.sm};
    inline-size: 100%;
    padding: ${({ theme }) => theme.space.md};
    background: ${({ theme }) => theme.color.surface};
    color: ${({ theme }) => theme.color.mutedText};
    border: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
    > svg { inline-size: var(--gh-size-9); block-size: var(--gh-size-9); }
    > [data-selected] { position: absolute; inset-block-start: ${({ theme }) => theme.space.sm}; inset-inline-end: ${({ theme }) => theme.space.sm}; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
    &[aria-pressed="true"] { border-color: ${({ theme }) => theme.color.link}; color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.rowHover}; }
    &:hover { border-color: ${({ theme }) => theme.color.link}; }
  }
`;
const Panel = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  h2 { margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; }
  > a { inline-size: 100%; }
  details { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  summary { cursor: pointer; min-block-size: var(--form-control-height); align-content: center; }
  code { display: block; margin-block-start: ${({ theme }) => theme.space.sm}; overflow-wrap: anywhere; }
`;
const ReleaseHeading = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.sm};
  > small { color: ${({ theme }) => theme.color.mutedText}; }
`;
const ContinueLink = styled(TextLink)`justify-self: center; margin-inline: auto;`;
const platformIcons = { android: AndroidIcon, windows: WindowsIcon };

export function DownloadPage({ locale }: { locale: string }) {
  const downloads = useAppDownloads();
  const [choice, setChoice] = useState<AppPlatform | null>(null);
  const selected = choice ?? downloads?.platform ?? null;
  const release = downloads?.catalog.releases.find(candidate => candidate.platform === selected);
  const messages = createMessages(locale);
  const development = downloads?.catalog.channel === "development";
  return <Page data-download-page><Stack $gap="lg">
    <Hero><TitleRow><BrandMark alt="" /><PageHeading>{messages.text("downloads.title")}</PageHeading></TitleRow></Hero>
    <Platforms role="group" aria-label={messages.text("downloads.platform")}>
      {appPlatforms.map(platform => {
        const PlatformIcon = platformIcons[platform];
        return <PlatformButton key={platform} variant="secondary" type="button" aria-pressed={selected === platform}
          data-download-platform={platform} onClick={() => setChoice(platform)}><PlatformIcon /><span>{messages.text(`downloads.${platform}`)}</span>
          {selected === platform && <CheckIcon data-selected />}</PlatformButton>;
      })}
    </Platforms>
    {selected && <Panel aria-live="polite">
      <ReleaseHeading><h2>{messages.text(`downloads.${selected}`)}{selected === downloads?.platform && <> ({messages.text("downloads.recommended")})</>}</h2>
        {development && <small>{messages.text("downloads.development")}</small>}</ReleaseHeading>
      {release ? <>
        {release.version && <p>{messages.text("downloads.compactVersion", { version: release.version })}
          {release.kind === "file" && <> · {messages.text(selected === "android" ? "downloads.androidFile" : "downloads.windowsFile")}</>}
          {release.size && <> · {messages.text("downloads.size", { size: messages.number(release.size / 1024 / 1024, { maximumFractionDigits: 1 }) })}</>}</p>}
        <ButtonLink href={release.href} prefetch={false} data-app-installer download={release.kind === "file" && !downloads?.native ? true : undefined}
          onClick={() => downloads?.acknowledge(release)}><DownloadIcon />{messages.text(release.kind === "store" ? "downloads.store" : "downloads.file", { platform: messages.text(`downloads.${selected}`) })}</ButtonLink>
        {release.sha256 && <details><summary>{messages.text("downloads.checksum")}</summary>
          <p>{messages.text("downloads.version", { version: release.version ?? "", build: String(release.build) })}</p><code>SHA-256: {release.sha256}</code></details>}
      </> : <p>{messages.text(!development && selected === "android" ? "downloads.playSoon" : "downloads.soon")}</p>}
    </Panel>}
    <ContinueLink href={homeHref(locale)}>{messages.text("downloads.continue")}</ContinueLink>
  </Stack></Page>;
}
