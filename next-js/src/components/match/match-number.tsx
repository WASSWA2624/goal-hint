"use client";

import type { CSSProperties, HTMLAttributes } from "react";

/** One ordinal slot for feed and slip cards; the phone layout fits multi-digit numbers inside the logo width. */
export function MatchNumber({ position, style, ...props }: HTMLAttributes<HTMLSpanElement> & { position: number }) {
  return <span {...props} data-match-number={position}
    style={{ ...style, "--match-number-digits": String(position).length } as CSSProperties} />;
}
