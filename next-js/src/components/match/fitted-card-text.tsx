"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

const Label = styled.span`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow: hidden;
  white-space: nowrap;
  > span { grid-area: 1 / 1; }
  > [data-full-measure] {
    inline-size: max-content;
    visibility: hidden;
    pointer-events: none;
  }
  > [data-compact-label] { overflow: hidden; text-overflow: ellipsis; }
`;

/** Use the authored abbreviation only when the rendered full wording exceeds its track. */
export function FittedCardText({ full, short }: { full: string; short: string }) {
  const track = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [useShort, setUseShort] = useState(false);
  const useAbbreviation = full !== short;
  useEffect(() => {
    const container = track.current, label = measure.current;
    if (!container || !label) return;
    const observer = new ResizeObserver(() => setUseShort(label.offsetWidth > container.clientWidth));
    observer.observe(container);
    observer.observe(label);
    return () => observer.disconnect();
  }, [useAbbreviation]);
  const abbreviated = useAbbreviation && useShort;
  return <Label ref={track} title={full}>
    {useAbbreviation && <span ref={measure} data-full-measure aria-hidden="true">{full}</span>}
    <span data-compact-label aria-hidden={abbreviated || undefined}>{abbreviated ? short : full}</span>
    {abbreviated && <VisuallyHidden>{full}</VisuallyHidden>}
  </Label>;
}
