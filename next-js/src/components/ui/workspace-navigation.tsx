"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";

/** Shared by the admin and member workspaces. */
export const WorkspaceNavigationLink = styled(Link)`
  display: flex; align-items: center; gap: var(--gh-spacing-2_5);
  min-block-size: var(--form-control-height); padding: 0 var(--gh-spacing-2_5);
  border-radius: ${({ theme }) => theme.radius.control}; color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium}; text-decoration: none; white-space: nowrap;
  > [data-sidebar-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
  > svg { flex: none; font-size: var(--gh-font-subheading); color: ${({ theme }) => theme.color.mutedText}; }
  &[aria-current="page"] {
    background: ${({ theme }) => theme.color.brandSoft}; font-weight: ${({ theme }) => theme.typography.weight.heavy};
    > svg { color: ${({ theme }) => theme.color.brand}; }
  }
  ${media.hover} { &:hover:not([aria-current="page"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
