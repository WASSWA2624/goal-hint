"use client";

import styled from "styled-components";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Container } from "@/components/ui/layout";

export const ShellFrame = styled.div`
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;

  > main { flex: 1; }
`;

export const SkipLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  max-inline-size: calc(100% - 32px);
  position: fixed;
  inset-block-start: ${({ theme }) => theme.space.sm};
  inset-inline-start: ${({ theme }) => theme.space.md};
  z-index: 10;
  padding: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};

  &:not(:focus) {
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    min-block-size: 0;
    overflow: hidden;
    white-space: nowrap;
  }
`;

export const Header = styled.header`
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
`;

export const HeaderContent = styled(Container)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.sm};
  padding-block: ${({ theme }) => theme.space.sm};

  > nav { min-inline-size: 0; max-inline-size: 100%; }
`;

export const HomeLink = styled(TextLink)`
  flex: none;
  text-decoration: none;
`;

export const NavigationList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  margin: 0;
  padding: 0;
  list-style: none;

  > li { min-inline-size: 0; max-inline-size: 100%; }
`;

export const NavigationLink = styled(ButtonLink)`
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surfaceMuted};
    border-block-end-color: ${({ theme }) => theme.color.brand};
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }
`;

export const Footer = styled.footer`
  padding-block: ${({ theme }) => theme.space.lg};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};

  a[aria-current="page"] {
    color: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-decoration-thickness: 0.15em;
  }
`;
