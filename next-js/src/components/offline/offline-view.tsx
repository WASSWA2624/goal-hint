"use client";

import { useSyncExternalStore } from "react";
import styled from "styled-components";
import { Header, HeaderContent, ShellFrame } from "@/components/navigation/shell-styles";
import { HeaderBrand } from "@/components/ui/brand";
import { DocumentButtonLink } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { Inline, MutedText, PageHeading, PageMain, Stack, Surface } from "@/components/ui/layout";

const Frame = styled(ShellFrame)`background: ${({ theme }) => theme.color.page};`;
const Main = styled(PageMain)`
  display: grid;
  align-items: start;
  justify-items: center;
  padding-block: clamp(var(--gh-spacing-6), 12vh, var(--gh-size-24));
`;
const Notice = styled(Surface)`
  inline-size: min(100%, ${({ theme }) => theme.layout.readingMaxWidth});
  padding: ${({ theme }) => theme.space.lg};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.radius.none};
  svg { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-page); }
`;
const subscribeDocument = () => () => {};
const currentDocument = () => "";
const retryDocument = () => /^\/offline\/?$/u.test(location.pathname) ? "/en/matches" : currentDocument();

/** This independently served document can be read and retried without a running application. */
export function OfflineView() {
  const retryHref = useSyncExternalStore(subscribeDocument, retryDocument, currentDocument);

  return <Frame data-offline-view>
    <Header><HeaderContent $wide><HeaderBrand /></HeaderContent></Header>
    <Main id="main-content">
      <Notice aria-labelledby="connection-heading">
        <Stack>
          <Icon><path d="M3 9a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15a4.5 4.5 0 0 1 6 0M12 19h.01M3 3l18 18" /></Icon>
          <Stack $gap="sm">
            <PageHeading id="connection-heading">Couldn’t load this page</PageHeading>
            <MutedText>Check your internet connection, then try again.</MutedText>
          </Stack>
          <Inline><DocumentButtonLink href={retryHref}>Try again</DocumentButtonLink></Inline>
        </Stack>
      </Notice>
    </Main>
  </Frame>;
}
