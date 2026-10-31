"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";

/** Shared by the admin and member workspaces. */
export const WorkspaceNavigationLink = styled(Link)`
  display: flex; align-items: center; gap: 10px;
  min-block-size: ${({ theme }) => theme.control.minHeight}; padding: 0 10px;
  border-radius: ${({ theme }) => theme.radius.control}; color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium}; text-decoration: none; white-space: nowrap;
  > [data-sidebar-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
  > svg { flex: none; font-size: 1.0625rem; color: ${({ theme }) => theme.color.mutedText}; }
  &[aria-current="page"] {
    background: ${({ theme }) => theme.color.brandSoft}; font-weight: ${({ theme }) => theme.typography.weight.heavy};
    > svg { color: ${({ theme }) => theme.color.brand}; }
  }
  ${media.hover} { &:hover:not([aria-current="page"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  ${media.desktop} { min-block-size: 40px; }
`;
