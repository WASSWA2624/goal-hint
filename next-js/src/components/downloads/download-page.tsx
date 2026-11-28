"use client";

import styled from "styled-components";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { DownloadIcon } from "@/components/ui/icons";
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
export function DownloadPage({ locale }: { locale: string }) {
  const downloads = useAppDownloads();
  const release = downloads?.catalog.releases.find(candidate => candidate.platform === "android");
  const installerLabel = release?.kind === "store" ? "downloads.store" : "downloads.file";
  const messages = createMessages(locale);
  const android = messages.text("downloads.android");
  const development = downloads?.catalog.channel === "development";
  return <Page data-download-page><Stack $gap="lg">
    <Hero><TitleRow><BrandMark alt="" /><PageHeading>{messages.text("downloads.title")}</PageHeading></TitleRow></Hero>
    <Panel aria-live="polite">
      <ReleaseHeading><h2>{android}</h2>
        {development && <small>{messages.text("downloads.development")}</small>}</ReleaseHeading>
      {release ? <>
        {release.version && <p>{messages.text("downloads.compactVersion", { version: release.version })}
          {release.kind === "file" && <> · {messages.text("downloads.androidFile")}</>}
          {release.size && <> · {messages.text("downloads.size", { size: messages.number(release.size / 1024 / 1024, { maximumFractionDigits: 1 }) })}</>}</p>}
        <ButtonLink href={release.href} prefetch={false} data-app-installer download={release.kind === "file" && !downloads?.native ? true : undefined}
          onClick={() => downloads?.acknowledge(release)}><DownloadIcon />{messages.text(installerLabel, { platform: android })}</ButtonLink>
        {release.sha256 && <details><summary>{messages.text("downloads.checksum")}</summary>
          <p>{messages.text("downloads.version", { version: release.version ?? "", build: String(release.build) })}</p><code>SHA-256: {release.sha256}</code></details>}
      </> : <p>{messages.text("downloads.soon")}</p>}
    </Panel>
    <ContinueLink href={homeHref(locale)}>{messages.text("downloads.continue")}</ContinueLink>
  </Stack></Page>;
}
