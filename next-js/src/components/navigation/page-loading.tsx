"use client";

import styled from "styled-components";
import { HeaderBrand } from "@/components/ui/brand";
import { Container, desktopSectionFrame, PageMain, Stack } from "@/components/ui/layout";
import { media } from "@/styles/theme";
import { FallbackStyleProvider } from "@/styles/provider";
import { Header, HeaderContent, ShellFrame } from "./shell-styles";

const Placeholder = styled.div`
  border-radius: ${({ theme }) => theme.radius.surface};
  min-block-size: 7rem;
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  background: ${({ theme }) => theme.color.surface};
  ${desktopSectionFrame}
`;
const LoadingStatus = styled.p`
  margin: 0;
  padding-block: ${({ theme }) => theme.space.md};
  color: ${({ theme }) => theme.color.mutedText};
  ${media.desktop} { padding-inline: ${({ theme }) => theme.space.md}; }
`;

/** A request-independent shell that can be prefetched before any stored page reads. */
export function PageLoading({ label }: { label: string }) {
  return <FallbackStyleProvider><ShellFrame>
    <Header><HeaderContent $wide><HeaderBrand /></HeaderContent></Header>
    <PageMain id="main-content" tabIndex={-1} $app $compact>
      <Container $wide><Stack>
        <LoadingStatus role="status">{label}</LoadingStatus>
        <Stack aria-hidden="true"><Placeholder /><Placeholder /><Placeholder /></Stack>
      </Stack></Container>
    </PageMain>
  </ShellFrame></FallbackStyleProvider>;
}
