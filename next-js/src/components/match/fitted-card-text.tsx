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
  [data-compact-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
  &[data-fitted-probability] > :is([data-full-measure], [data-fitted-line]) {
    display: flex; align-items: baseline; gap: var(--gh-spacing-0_75);
  }
  :is([data-pick-probability], [data-fitted-measure-suffix]) { flex: none; font-variant-numeric: tabular-nums; }
`;

/** Use the authored abbreviation only when the rendered full wording exceeds its track. */
export function FittedCardText({ full, short, probability }: { full: string; short: string; probability?: string | null }) {
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
  const chance = probability ? `(${probability})` : null;
  const label = <span data-compact-label data-pick-selection={chance ? "" : undefined}
    aria-hidden={abbreviated || undefined}>{abbreviated ? short : full}</span>;
  const fullLabel = abbreviated && <VisuallyHidden>{full}</VisuallyHidden>;
  return <Label ref={track} title={full} data-fitted-probability={chance ? "" : undefined}>
    {useAbbreviation && <span ref={measure} data-full-measure aria-hidden="true">
      {chance ? <><span>{full}</span><span data-fitted-measure-suffix>{chance}</span></> : full}
    </span>}
    {chance ? <span data-fitted-line>{label}{fullLabel}{" "}<span data-pick-probability>{chance}</span></span>
      : <>{label}{fullLabel}</>}
  </Label>;
}
