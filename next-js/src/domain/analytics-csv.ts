export type CsvColumn<Row> = Readonly<{ header: string; value: (row: Row) => string | number | null | undefined }>;

/**
 * RFC 4180 CSV with spreadsheet formula neutralization: a cell that starts with = + - @, tab or
 * carriage return is prefixed with an apostrophe so exported page titles or search terms cannot run as formulas.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(column.value(row))).join(","));
  // A byte-order mark lets spreadsheet apps detect UTF-8 for accented team and city names.
  return `﻿${lines.join("\r\n")}\r\n`;
}
