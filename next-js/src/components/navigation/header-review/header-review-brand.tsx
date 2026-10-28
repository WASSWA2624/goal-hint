"use client";

import styled, { useTheme } from "styled-components";

/** Original vector artwork, composed with equal visible emblem and wordmark heights. */
const Image = styled.img<{ $height: number }>`
  display: block;
  flex: none;
  inline-size: ${({ $height }) => $height * 10490 / 1500}px;
  block-size: ${({ $height }) => $height}px;
`;

/** Preview-only: the production logo and its spacing are intentionally independent. */
export function HeaderReviewBrand({ height = 20 }: { height?: number }) {
  const theme = useTheme();
  return <Image
    src={`/brand/review/goal-hint-header-${theme.mode === "dark" ? "inverse" : "primary"}.svg`}
    alt="Goal Hint"
    width={10490}
    height={1500}
    $height={height}
  />;
}
