"use client";

import { filledTableRows } from "@/components/ui/filled-surfaces";
import { useMemo, useState, type CSSProperties } from "react";
import styled from "styled-components";
import type { BreakdownRow } from "@/domain/analytics";
import { formatValue, type Dataset, type DatasetColumn } from "@/domain/analytics-datasets";

type Sort = Readonly<{ key: string; direction: "ascending" | "descending" }>;

function compare(left: BreakdownRow[string] | undefined, right: BreakdownRow[string] | undefined, column: DatasetColumn): number {
  if (column.kind === "text") return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true, sensitivity: "base" });
  return Number(left ?? 0) - Number(right ?? 0);
}

/** Sortable breakdown table with share bars, progressive disclosure, CSV export and optional row filters. */
export function DataTable({ id, dataset, rows, exportHref, onFilter, pageSize = 10 }: {
  id: string; dataset: Dataset; rows: readonly BreakdownRow[]; exportHref: string;
  onFilter?: ((row: BreakdownRow) => void) | undefined; pageSize?: number;
}) {
  const firstNumeric = dataset.columns.find((column) => column.kind === "count");
  const [sort, setSort] = useState<Sort>({ key: firstNumeric?.key ?? dataset.columns[0]!.key, direction: "descending" });
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    const column = dataset.columns.find((entry) => entry.key === sort.key) ?? dataset.columns[0]!;
    const factor = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort((left, right) => factor * compare(left[column.key], right[column.key], column));
  }, [rows, sort, dataset.columns]);
  const visible = expanded ? sorted : sorted.slice(0, pageSize);
  const maximum = firstNumeric ? Math.max(1, ...rows.map((row) => Number(row[firstNumeric.key] ?? 0))) : 1;

  function toggle(column: DatasetColumn) {
    setSort((current) => current.key === column.key
      ? { key: column.key, direction: current.direction === "descending" ? "ascending" : "descending" }
      : { key: column.key, direction: column.kind === "text" ? "ascending" : "descending" });
  }

  return (
    <TableBlock>
      <TableTools>
        <Description id={`${id}-description`}>{dataset.description}{onFilter ? " Select a row to filter the whole dashboard." : ""}</Description>
        <ExportLink href={exportHref} download aria-label={`Export ${dataset.title} as CSV`} data-analytics-ignore="">Export CSV</ExportLink>
      </TableTools>
      {rows.length === 0 ? <Empty>No {dataset.title.toLowerCase()} recorded in this period.</Empty> : <>
        <Scroller tabIndex={0} role="region" aria-labelledby={`${id}-caption`}>
          <Table aria-describedby={`${id}-description`}>
            <caption id={`${id}-caption`}>{dataset.title}</caption>
            <thead>
              <tr>
                {dataset.columns.map((column) => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction : "none"}
                  data-numeric={column.kind !== "text" || undefined}>
                  <SortButton type="button" onClick={() => toggle(column)}>
                    {column.header}<SortMark aria-hidden="true">{sort.key === column.key ? (sort.direction === "ascending" ? "▲" : "▼") : "↕"}</SortMark>
                  </SortButton>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const share = firstNumeric ? Number(row[firstNumeric.key] ?? 0) / maximum : 0;
                return <tr key={index}>
                  {dataset.columns.map((column, columnIndex) => {
                    const value = formatValue(row[column.key], column.kind);
                    if (columnIndex === 0) {
                      return <th key={column.key} scope="row" style={{ "--share": `${Math.round(share * 100)}%` } as CSSProperties}>
                        {onFilter ? <RowFilter type="button" onClick={() => onFilter(row)} title="Filter the dashboard by this value">{value}</RowFilter>
                          : <span>{value}</span>}
                      </th>;
                    }
                    return <td key={column.key} data-numeric={column.kind !== "text" || undefined} title={column.kind === "text" ? value : undefined}>{value}</td>;
                  })}
                </tr>;
              })}
            </tbody>
          </Table>
        </Scroller>
        {rows.length > pageSize && <MoreButton type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Show fewer rows" : `Show all ${rows.length} rows`}
        </MoreButton>}
      </>}
    </TableBlock>
  );
}

const TableBlock = styled.div`
  display: grid;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
`;
const TableTools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-2) var(--gh-spacing-4);
`;
const Description = styled.p`
  flex: 1 1 var(--gh-size-64);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
const ExportLink = styled.a`
  border-radius: ${({ theme }) => theme.radius.control};
  display: inline-flex;
  align-items: center;
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-2_5);
  border: 0;
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  @media (hover: hover) { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.text}; } }
`;
const Scroller = styled.div`
  overflow-x: auto;
  max-inline-size: 100%;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; }
`;
const Table = styled.table`
  ${filledTableRows}
  inline-size: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.scale.body};
  caption { position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  th, td {
    padding: var(--gh-spacing-1_75) var(--gh-spacing-2_5);
    border-block-end: 0;
    text-align: start;
    vertical-align: middle;
  }
  td { max-inline-size: var(--gh-size-88); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-numeric] { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  thead th { padding: 0; color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; white-space: nowrap; }
  thead th[data-numeric] button { justify-content: flex-end; }
  tbody th {
    min-inline-size: var(--gh-size-48);
    max-inline-size: var(--gh-size-112);
    font-weight: ${({ theme }) => theme.typography.weight.body};
    background: linear-gradient(90deg, ${({ theme }) => theme.color.brandSoft} var(--share), transparent var(--share));
    overflow-wrap: anywhere;
  }
  tbody tr:last-child > * { border-block-end: 0; }
`;
const SortButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  inline-size: 100%;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
const SortMark = styled.span`
  font-size: var(--gh-font-relative);
  opacity: var(--gh-opacity-70);
`;
const RowFilter = styled.button`
  padding: 0;
  border: 0;
  background: none;
  color: ${({ theme }) => theme.color.link};
  font: inherit;
  text-align: start;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: var(--gh-relativeSize-0_2);
  cursor: pointer;
  @media (hover: hover) { &:hover { text-decoration-color: currentColor; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
const MoreButton = styled.button`
  justify-self: start;
  padding: var(--gh-spacing-1_5) 0;
  border: 0;
  background: none;
  color: ${({ theme }) => theme.color.link};
  font: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
`;
const Empty = styled.p`
  padding: var(--gh-spacing-6) var(--gh-spacing-3);
  color: ${({ theme }) => theme.color.mutedText};
  text-align: center;
  background: ${({ theme }) => theme.color.surfaceMuted};
`;
