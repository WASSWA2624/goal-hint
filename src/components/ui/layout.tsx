"use client";

import styled from "styled-components";

/** `$wide` suits dense tables such as the desktop match feed. */
export const Container = styled.div<{ $wide?: boolean }>`
  inline-size: 100%;
  max-inline-size: ${({ theme, $wide }) => $wide ? theme.layout.wideMaxWidth : theme.layout.maxWidth};
  margin-inline: auto;
  padding-inline: ${({ theme }) => theme.layout.gutter};
  min-inline-size: 0;
`;

export const Stack = styled.div<{ $gap?: "sm" | "md" | "lg" | "xl" }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap = "md" }) => theme.space[$gap]};
  min-inline-size: 0;
`;

export const Inline = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
  min-inline-size: 0;

  > * { min-inline-size: 0; }
`;

export const Surface = styled.section`
  min-inline-size: 0;
  padding: ${({ theme }) => theme.space.lg};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  border-radius: ${({ theme }) => theme.border.radius};
`;

export const PageMain = styled.main`
  padding-block: ${({ theme }) => theme.space.xl};
  min-inline-size: 0;
`;

export const PageHeading = styled.h1`
  font-size: ${({ theme }) => theme.typography.size.h1};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
`;

export const SectionHeading = styled.h2`
  font-size: ${({ theme }) => theme.typography.size.h2};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
`;

export const BodyText = styled.p`
  max-inline-size: 65ch;
`;

export const MutedText = styled(BodyText)`
  color: ${({ theme }) => theme.color.mutedText};
`;
