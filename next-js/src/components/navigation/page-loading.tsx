"use client";

import styled from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { FallbackStyleProvider } from "@/styles/provider";
import { Header, HeaderContent, ShellFrame } from "./shell-styles";

const Placeholder = styled.div`
  min-block-size: 7rem;
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  background: ${({ theme }) => theme.color.surface};
`;
const LoadingStatus = styled.p`
  margin: 0;
  padding-block: ${({ theme }) => theme.space.md};
  color: ${({ theme }) => theme.color.mutedText};
`;

/** A request-independent shell that can be prefetched before any stored page reads. */
export function PageLoading({ label }: { label: string }) {
  return <FallbackStyleProvider><ShellFrame>
    <Header><HeaderContent $wide><BrandLogo /></HeaderContent></Header>
    <PageMain id="main-content" tabIndex={-1} $app $compact>
      <Container $wide><Stack>
        <LoadingStatus role="status">{label}</LoadingStatus>
        <Stack aria-hidden="true"><Placeholder /><Placeholder /><Placeholder /></Stack>
      </Stack></Container>
    </PageMain>
  </ShellFrame></FallbackStyleProvider>;
}
