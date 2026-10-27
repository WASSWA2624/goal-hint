"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styled, { useTheme } from "styled-components";
import type { GoalHintTheme } from "@/styles/theme";

/**
 * Small dependency-free SVG charts for the analytics dashboard. Marks follow one spec: 2px lines,
 * 10% area wash, hairline grids, bars capped at 24px with 4px rounded data ends, 2px surface gaps
 * between touching fills, and a hover/focus tooltip on every chart (values also live in the tables).
 */

export function chartColors(theme: GoalHintTheme) {
  return {
    series: [theme.color.accent.blue.solid, theme.color.accent.orange.solid, theme.color.accent.emerald.solid],
    comparison: theme.color.controlBorder,
    grid: theme.color.border,
    axis: theme.color.mutedText,
    surface: theme.color.surface,
  } as const;
}

export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width))); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round an axis maximum up to 1, 2, 2.5 or 5 × 10^n. */
export function niceMaximum(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * power) return step * power;
  return 10 * power;
}

/** About four evenly spaced ticks on 1/2/2.5/5 steps; whole-number metrics never get fractional ticks. */
export function axisTicks(maximum: number, integer: boolean): readonly number[] {
  if (!Number.isFinite(maximum) || maximum <= 0) return [0, 1];
  const target = Math.max(maximum, integer ? 1 : 0) / 4;
  const power = 10 ** Math.floor(Math.log10(target));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = (steps.find((candidate) => candidate * power >= target) ?? 10) * power;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.max(step, Math.ceil(maximum / step) * step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

export type TrendPoint = Readonly<{ label: string; value: number; previous?: number | undefined; previousLabel?: string | undefined }>;

export function TrendChart({ points, format, axisFormat = format, name, comparisonName, integer = false, height = 240 }: {
  points: readonly TrendPoint[]; format: (value: number) => string; axisFormat?: (value: number) => string;
  name: string; comparisonName?: string | undefined; integer?: boolean; height?: number;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const [frame, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();
  const pad = { top: 12, right: 12, bottom: 28, left: 52 };
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom;
  const hasComparison = points.some((point) => point.previous !== undefined);
  const ticks = axisTicks(Math.max(...points.map((point) => Math.max(point.value, point.previous ?? 0)), 0), integer);
  const maximum = ticks.at(-1) ?? 1;
  const x = (index: number) => pad.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => pad.top + plotHeight - (value / maximum) * plotHeight;
  const line = (values: readonly number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const current = line(points.map((point) => point.value));
  const area = points.length > 0 ? `${current}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 90))));

  function locate(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  }
  function onKey(event: KeyboardEvent<SVGRectElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    setActive((index) => {
      const start = index ?? (event.key === "ArrowLeft" ? points.length : -1);
      if (event.key === "Home") return 0;
      if (event.key === "End") return points.length - 1;
      return Math.min(points.length - 1, Math.max(0, start + (event.key === "ArrowLeft" ? -1 : 1)));
    });
  }
  const point = active === null ? null : points[active];

  return (
    <ChartFrame ref={frame}>
      {hasComparison && <Legend>
        <LegendItem><LineKey $color={colors.series[0]} />{name}</LegendItem>
        <LegendItem><LineKey $color={colors.comparison} />{comparisonName}</LegendItem>
      </Legend>}
      <svg width={width} height={height} role="img" aria-label={`${name} trend chart. Use the arrow keys for values; the table view lists every value.`}>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colors.series[0]} stopOpacity={0.14} />
            <stop offset="1" stopColor={colors.series[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={colors.grid} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fill={colors.axis} fontSize={11}>{axisFormat(tick)}</text>
        </g>)}
        {points.map((entry, index) => index % labelEvery === 0 && <text key={entry.label} x={x(index)} y={height - 8}
          textAnchor={index === 0 && points.length > 1 ? "start" : index === points.length - 1 && points.length > 1 ? "end" : "middle"}
          fill={colors.axis} fontSize={11}>{entry.label}</text>)}
        {hasComparison && <path d={line(points.map((entry) => entry.previous ?? 0))} fill="none" stroke={colors.comparison} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={current} fill="none" stroke={colors.series[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {point && active !== null && <g pointerEvents="none">
          <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotHeight} stroke={colors.axis} strokeWidth={1} />
          {point.previous !== undefined && <circle cx={x(active)} cy={y(point.previous)} r={4} fill={colors.comparison} stroke={colors.surface} strokeWidth={2} />}
          <circle cx={x(active)} cy={y(point.value)} r={4.5} fill={colors.series[0]} stroke={colors.surface} strokeWidth={2} />
        </g>}
        <ChartFocus x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} fill="transparent" tabIndex={0}
          aria-label={point ? `${point.label}: ${format(point.value)}` : `${name}: focus and use the arrow keys`}
          onPointerMove={locate} onPointerDown={locate} onPointerLeave={() => setActive(null)} onFocus={() => setActive((index) => index ?? points.length - 1)}
          onBlur={() => setActive(null)} onKeyDown={onKey} style={{ touchAction: "pan-y" }} />
      </svg>
      {point && active !== null && <Tooltip style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: pad.top }} role="status">
        <TooltipLabel>{point.label}</TooltipLabel>
        <TooltipRow><LineKey $color={colors.series[0]} /><strong>{format(point.value)}</strong><span>{name}</span></TooltipRow>
        {point.previous !== undefined && <TooltipRow><LineKey $color={colors.comparison} /><strong>{format(point.previous)}</strong>
          <span>{point.previousLabel ?? comparisonName}</span></TooltipRow>}
      </Tooltip>}
    </ChartFrame>
  );
}

export type Part = Readonly<{ label: string; value: number; display: string }>;

/** Two or three shares of one whole: a 100% bar with 2px surface gaps, then a labelled legend. */
export function SplitBar({ parts, label }: { parts: readonly Part[]; label: string }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const [active, setActive] = useState<number | null>(null);
  return (
    <div>
      <SplitTrack role="img" aria-label={`${label}: ${parts.map((part) => `${part.label} ${part.display}`).join(", ")}`}>
        {total === 0 ? <SplitEmpty /> : parts.map((part, index) => part.value > 0 && (
          <SplitSegment key={part.label} style={{ flexGrow: part.value, background: colors.series[index] }} $active={active === index}
            onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)} title={`${part.label}: ${part.display}`} />
        ))}
      </SplitTrack>
      <Legend as="ul" $stacked>
        {parts.map((part, index) => <LegendItem as="li" key={part.label}>
          <SwatchKey $color={colors.series[index] ?? colors.comparison} />
          <span>{part.label}</span><LegendValue>{part.display} · {total > 0 ? Math.round((part.value / total) * 100) : 0}%</LegendValue>
        </LegendItem>)}
      </Legend>
    </div>
  );
}

/** Ranked horizontal bars: label above a thin bar, value at the bar's end. Rows can act as filters. */
export function BarList({ rows, format, onSelect, empty }: {
  rows: readonly Readonly<{ key: string; label: ReactNode; value: number }>[]; format: (value: number) => string;
  onSelect?: ((key: string) => void) | undefined; empty: string;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <EmptyChart>{empty}</EmptyChart>;
  return (
    <BarRows>
      {rows.map((row) => {
        const content = <>
          <BarHead><span>{row.label}</span><strong>{format(row.value)}</strong></BarHead>
          <BarTrack><BarFill style={{ width: `${Math.max(1.5, (row.value / maximum) * 100)}%`, background: colors.series[0] }} /></BarTrack>
        </>;
        return <li key={row.key}>{onSelect ? <BarButton type="button" onClick={() => onSelect(row.key)} title="Filter by this value">{content}</BarButton>
          : <BarStatic>{content}</BarStatic>}</li>;
      })}
    </BarRows>
  );
}

/** Few ordered categories as columns, values on the caps. */
export function ColumnChart({ columns, format, label, height = 180 }: {
  columns: readonly Readonly<{ label: string; value: number }>[]; format: (value: number) => string; label: string; height?: number;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const [frame, width] = useWidth<HTMLDivElement>(360);
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 20, bottom: 34, side: 8 };
  const maximum = niceMaximum(Math.max(0, ...columns.map((column) => column.value)));
  const band = (width - pad.side * 2) / Math.max(1, columns.length);
  const barWidth = Math.min(24, band * 0.6);
  const plot = height - pad.top - pad.bottom;
  return (
    <ChartFrame ref={frame}>
      <svg width={width} height={height} role="img" aria-label={`${label}: ${columns.map((column) => `${column.label} ${format(column.value)}`).join(", ")}`}>
        <line x1={pad.side} x2={width - pad.side} y1={pad.top + plot} y2={pad.top + plot} stroke={colors.grid} strokeWidth={1} shapeRendering="crispEdges" />
        {columns.map((column, index) => {
          const barHeight = maximum > 0 ? (column.value / maximum) * plot : 0;
          const cx = pad.side + band * index + band / 2;
          const top = pad.top + plot - barHeight;
          const r = Math.min(4, barHeight / 2, barWidth / 2);
          const left = cx - barWidth / 2, right = cx + barWidth / 2, base = pad.top + plot;
          return <g key={column.label} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
            <rect x={cx - band / 2} y={pad.top} width={band} height={plot} fill="transparent" />
            {barHeight > 0 && <path d={`M${left},${base}V${top + r}Q${left},${top} ${left + r},${top}H${right - r}Q${right},${top} ${right},${top + r}V${base}Z`}
              fill={colors.series[0]} opacity={active === null || active === index ? 1 : 0.55} />}
            <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fill={theme.color.text}>{format(column.value)}</text>
            <text x={cx} y={height - 12} textAnchor="middle" fontSize={11} fill={colors.axis}>{column.label}</text>
          </g>;
        })}
      </svg>
    </ChartFrame>
  );
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Visits by weekday and hour: one-hue sequential cells that recede to the surface at zero. */
export function Heatmap({ grid, format }: { grid: readonly (readonly number[])[]; format: (value: number) => string }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const maximum = Math.max(1, ...grid.flat());
  const [active, setActive] = useState<string | null>(null);
  return (
    <HeatGrid role="table" aria-label="Visits by weekday and hour, East Africa Time">
      <div role="row" className="hours"><span role="columnheader" />{Array.from({ length: 24 }, (_, hour) =>
        <span key={hour} role="columnheader" aria-label={`${hour}:00`}>{hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}</span>)}</div>
      {grid.map((row, day) => <div role="row" key={weekdays[day]}>
        <span role="rowheader">{weekdays[day]}</span>
        {row.map((value, hour) => {
          const key = `${day}-${hour}`;
          const label = `${weekdays[day]} ${String(hour).padStart(2, "0")}:00 – ${format(value)} visits`;
          return <HeatCell key={key} role="cell" tabIndex={-1} aria-label={label} title={label} $active={active === key}
            onPointerEnter={() => setActive(key)} onPointerLeave={() => setActive(null)}
            style={{ background: value === 0 ? theme.color.surfaceMuted : colors.series[0], opacity: value === 0 ? 1 : 0.18 + 0.82 * (value / maximum) }} />;
        })}
      </div>)}
    </HeatGrid>
  );
}

export const ChartFrame = styled.div`
  position: relative;
  inline-size: 100%;
  min-inline-size: 0;
  svg { display: block; overflow: visible; font-family: inherit; font-variant-numeric: tabular-nums; }
`;
const ChartFocus = styled.rect`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
`;
const Legend = styled.div<{ $stacked?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${({ $stacked }) => $stacked && "flex-direction: column; margin: 12px 0 0;"}
`;
const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;
const LegendValue = styled.span`
  margin-inline-start: auto;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums;
`;
const LineKey = styled.span<{ $color: string }>`
  display: inline-block;
  inline-size: 14px;
  block-size: 2px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
`;
const SwatchKey = styled.span<{ $color: string }>`
  display: inline-block;
  inline-size: 10px;
  block-size: 10px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
`;
const Tooltip = styled.div`
  position: absolute;
  z-index: 2;
  transform: translate(-50%, -100%);
  display: grid;
  gap: 4px;
  min-inline-size: 150px;
  padding: 8px 10px;
  pointer-events: none;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
const TooltipLabel = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
`;
const TooltipRow = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  strong { font-variant-numeric: tabular-nums; }
  span:last-child { color: ${({ theme }) => theme.color.mutedText}; }
`;
const SplitTrack = styled.div`
  display: flex;
  gap: 2px;
  block-size: 16px;
`;
const SplitSegment = styled.span<{ $active: boolean }>`
  min-inline-size: 4px;
  border-radius: 4px;
  opacity: ${({ $active }) => ($active ? 0.85 : 1)};
`;
const SplitEmpty = styled.span`
  flex: 1;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.surfaceMuted};
`;
const BarRows = styled.ol`
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
`;
const barRow = `
  display: grid;
  gap: 4px;
  inline-size: 100%;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  text-align: start;
`;
const BarButton = styled.button`
  ${barRow}
  border-radius: ${({ theme }) => theme.border.radius};
  cursor: pointer;
  @media (hover: hover) { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;
const BarStatic = styled.div`${barRow}`;
const BarHead = styled.span`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: ${({ theme }) => theme.typography.scale.body};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-variant-numeric: tabular-nums; }
`;
const BarTrack = styled.span`
  display: block;
  block-size: 8px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.surfaceMuted};
`;
const BarFill = styled.span`
  display: block;
  block-size: 100%;
  border-radius: 4px;
`;
export const EmptyChart = styled.p`
  display: grid;
  place-items: center;
  min-block-size: 120px;
  padding: 16px;
  color: ${({ theme }) => theme.color.mutedText};
  text-align: center;
`;
const HeatGrid = styled.div`
  display: grid;
  gap: 2px;
  font-size: ${({ theme }) => theme.typography.scale.micro};
  color: ${({ theme }) => theme.color.mutedText};
  font-variant-numeric: tabular-nums;
  [role="row"] {
    display: grid;
    grid-template-columns: 32px repeat(24, minmax(0, 1fr));
    gap: 2px;
    align-items: center;
  }
  .hours span { overflow: visible; white-space: nowrap; text-align: start; }
`;
const HeatCell = styled.span<{ $active: boolean }>`
  display: block;
  block-size: 18px;
  border-radius: 2px;
  outline: ${({ $active, theme }) => ($active ? `2px solid ${theme.color.text}` : "none")};
`;
