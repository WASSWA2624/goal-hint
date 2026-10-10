"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import styled from "styled-components";
import { media, type OutcomeTone } from "@/styles/theme";

export type StatusTextProps = Omit<
  ComponentPropsWithRef<"span">,
  "children" | "role" | "aria-live" | "aria-atomic"
> & {
  tone: OutcomeTone;
  children: ReactNode;
  /** Enable only for a changing result or failure that needs a polite announcement. */
  announce?: boolean;
};

export type EmptyStateProps = Omit<
  ComponentPropsWithRef<"section">,
  "children" | "title" | "aria-label" | "aria-labelledby"
> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3 | 4;
};

/** A compact chip on phones and tablets; the roomier desktop chip from `lg`. */
const StatusContainer = styled.span<{ $tone: OutcomeTone }>`
  display: inline-flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.xs};
  max-inline-size: 100%;
  padding: 1px 6px;
  color: ${({ theme, $tone }) => theme.color.outcome[$tone].text};
  background: ${({ theme, $tone }) => theme.color.outcome[$tone].background};
  border: ${({ theme }) => theme.border.width} solid
    ${({ theme, $tone }) => theme.color.outcome[$tone].border};
  border-radius: ${({ theme }) => theme.border.radius};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1.3;
  ${media.desktop} {
    padding-block: ${({ theme }) => theme.space.xs};
    padding-inline: ${({ theme }) => theme.space.sm};
    font-size: inherit;
    line-height: ${({ theme }) => theme.typography.lineHeight.body};
  }
`;

const StatusLabel = styled.span`
  min-inline-size: 0;
  overflow-wrap: anywhere;
`;

/** Phones: centred on the first 1.3 line, (1.3 - 1.1) / 2 = 0.1em. */
const StatusIcon = styled.svg`
  flex-shrink: 0;
  inline-size: 1.1em;
  block-size: 1.1em;
  margin-block-start: 0.1em;
  ${media.desktop} {
    inline-size: 1.25em;
    block-size: 1.25em;
    margin-block-start: 0.125em;
  }
`;

const EmptyContainer = styled.section`
  min-inline-size: 0;
  max-inline-size: 100%;
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  overflow-wrap: anywhere;
  ${media.desktop} { padding: ${({ theme }) => theme.space.lg}; font-size: inherit; }
`;

const EmptyTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${media.desktop} { font-size: ${({ theme }) => theme.typography.size.h3}; }
`;

const EmptyDescription = styled.div`
  margin-block-start: 2px;
  color: ${({ theme }) => theme.color.mutedText};
  ${media.desktop} { margin-block-start: ${({ theme }) => theme.space.sm}; }
`;

const EmptyAction = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};
  margin-block-start: ${({ theme }) => theme.space.sm};
  ${media.desktop} { margin-block-start: ${({ theme }) => theme.space.md}; }
`;

function OutcomeIcon({ tone }: { tone: OutcomeTone }) {
  let symbol: ReactNode;

  switch (tone) {
    case "correct":
      symbol = <path d="m5 12 4 4L19 6" />;
      break;
    case "incorrect":
      symbol = <path d="m6 6 12 12M18 6 6 18" />;
      break;
    case "pending":
      symbol = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
      break;
    case "void":
      symbol = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m6 18 12-12" />
        </>
      );
      break;
    case "unavailable":
      symbol = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 12h10" />
        </>
      );
      break;
  }

  return (
    <StatusIcon
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {symbol}
    </StatusIcon>
  );
}

/** Keep the label explicit; color and the decorative icon never replace outcome text. */
export function StatusText({ tone, children, announce = false, ...props }: StatusTextProps) {
  return (
    <StatusContainer
      {...props}
      $tone={tone}
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? true : undefined}
    >
      <OutcomeIcon tone={tone} />
      <StatusLabel>{children}</StatusLabel>
    </StatusContainer>
  );
}

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
  ...props
}: EmptyStateProps) {
  const headingId = `gh-empty-${useId()}`;

  return (
    <EmptyContainer {...props} aria-labelledby={headingId}>
      <EmptyTitle as={`h${headingLevel}`} id={headingId}>
        {title}
      </EmptyTitle>
      {description && <EmptyDescription>{description}</EmptyDescription>}
      {action && <EmptyAction>{action}</EmptyAction>}
    </EmptyContainer>
  );
}
