"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { teamDisplayCandidates, validTeamCode } from "@/domain/team-name";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export type ShortTeamNameProps = {
  name: string;
  /** Provider team code (2–5 letters or digits); null when the team has none yet (the shortened name stands in). */
  code?: string | null;
  className?: string;
};

/**
 * Fit state: the candidate index, with a trailing "!" when even the last candidate overflows and the CSS ellipsis
 * shows. Strings compare by value, so an unchanged result never re-renders.
 */
type Choice = `${number}` | `${number}!`;
type Tracked = { candidates: readonly string[]; apply: (choice: Choice) => void };

/**
 * One ResizeObserver and one animation-frame batch serve every name on the page. The observer reports content-box
 * widths, so the batch reads only computed styles (never layout) and measures candidate strings once per font on a
 * shared canvas; state updates follow all reads, in one write phase.
 */
const tracked = new Map<Element, Tracked>();
const widths = new WeakMap<Element, number>();
const pending = new Set<Element>();
const textWidths = new Map<string, number>();
let observer: ResizeObserver | undefined;
let frame = 0;
let context: CanvasRenderingContext2D | null | undefined;
let fontsWatched = false;

function textWidth(font: string, text: string): number {
  const key = `${font}\u0000${text}`;
  let width = textWidths.get(key);
  if (width === undefined) {
    context ??= document.createElement("canvas").getContext("2d");
    // Without a canvas every candidate "fits", so the full name stays and CSS truncates it.
    if (!context) return 0;
    context.font = font;
    width = context.measureText(text).width;
    if (textWidths.size >= 2048) textWidths.clear();
    textWidths.set(key, width);
  }
  return width;
}

function choose(element: Element, { candidates }: Tracked, available: number): Choice {
  const style = getComputedStyle(element);
  // Only a single-line box (the phone tile) swaps names; a wrapping one (the desktop table) keeps the full name.
  if (style.whiteSpace !== "nowrap" || candidates.length === 0) return "0";
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // Half a pixel of headroom, so canvas and layout rounding never leave a stray ellipsis on a name that "fits".
  const index = candidates.findIndex((candidate) => textWidth(font, candidate) + 0.5 <= available);
  return index >= 0 ? `${index}` : `${candidates.length - 1}!`;
}

function flush() {
  frame = 0;
  const updates: [Tracked, Choice][] = [];
  for (const element of pending) {
    const entry = tracked.get(element), available = widths.get(element);
    if (entry && available !== undefined) updates.push([entry, choose(element, entry, available)]);
  }
  pending.clear();
  for (const [entry, choice] of updates) entry.apply(choice);
}

function schedule(element: Element) {
  pending.add(element);
  if (frame === 0) frame = requestAnimationFrame(flush);
}

/** Web fonts change every measurement once they arrive. */
function watchFonts() {
  if (fontsWatched || !document.fonts) return;
  fontsWatched = true;
  const remeasure = () => { textWidths.clear(); for (const element of tracked.keys()) schedule(element); };
  void document.fonts.ready.then(remeasure);
  document.fonts.addEventListener("loadingdone", remeasure);
}

function track(element: Element, entry: Tracked): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  watchFonts();
  observer ??= new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      widths.set(target, contentRect.width);
      schedule(target);
    }
  });
  tracked.set(element, entry);
  // observe() always reports the current size once, which schedules the first measurement.
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    tracked.delete(element);
    widths.delete(element);
    pending.delete(element);
  };
}

/**
 * A team name that keeps to one line in tight spots: the full name renders first (and on the server); after layout,
 * if it overflows its box, it gives way to the code (when present) or the shortened name, and finally truncates with
 * an ellipsis. The full name stays in visually hidden text and the tooltip whenever another form shows. The box's
 * width must not depend on its text (for example `flex: 1 1 0` with `min-inline-size: 0`), or fitting could not
 * settle.
 */
function ShortTeamNameView({ name, code = null, className }: ShortTeamNameProps) {
  const candidates = useMemo(() => teamDisplayCandidates(name, code), [name, code]);
  const [fit, setFit] = useState<{ candidates: readonly string[]; choice: Choice }>({ candidates, choice: "0" });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return track(element, {
      candidates,
      apply: (choice) => setFit((previous) => previous.candidates === candidates && previous.choice === choice
        ? previous : { candidates, choice }),
    });
  }, [candidates]);
  // A re-render can change the font (a winner turns bold) without resizing the box, so measure after every commit.
  useEffect(() => { if (ref.current && tracked.has(ref.current)) schedule(ref.current); });

  const choice = fit.candidates === candidates ? fit.choice : "0";
  const index = Math.min(Number.parseInt(choice, 10), candidates.length - 1);
  // The first candidate is the whitespace-normalized name; the name itself renders exactly as given.
  const shortened = index > 0, truncated = choice.endsWith("!");
  return <span ref={ref} className={className} title={shortened || truncated ? name : undefined}
    data-name-fit={shortened ? (candidates[index] === validTeamCode(code) ? "code" : "short") : undefined}>
    {shortened ? <><span aria-hidden="true">{candidates[index]}</span><VisuallyHidden>{name}</VisuallyHidden></> : name}
  </span>;
}

export const ShortTeamName = memo(ShortTeamNameView);
