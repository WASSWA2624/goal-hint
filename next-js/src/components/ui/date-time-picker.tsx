"use client";

import { useState } from "react";
import styled from "styled-components";
import { shortMonths, formatDateEntry, type DateEntryMode } from "@/domain/date-entry";
import { constrainDatePicker, datePickerParts, datePickerValue, datePickerPartBounds, type DatePickerPart } from "@/domain/date-picker";
import { dateTimeIntervalRange } from "@/domain/date-time";
import { createMessages } from "@/i18n/messages";
import { CriteriaDialog } from "./criteria-dialog";
import { ScrollPickerColumn } from "./scroll-picker-column";

const Columns = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gh-spacing-1);
  [data-scroll-picker-column]:nth-last-child(-n+2) { min-inline-size: 0; }
  &[data-mode="time"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const TimeColumns = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-1); margin-block-start: var(--gh-spacing-2);
`;
const Preview = styled.p`
  margin: 0 0 var(--gh-spacing-3); text-align: center; font-size: var(--gh-font-body); font-variant-numeric: tabular-nums;
`;
const ErrorMessage = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: var(--gh-font-secondary); margin-block-end: 0;`;
const twoDigits = (value: number) => String(value).padStart(2, "0");

/** A local draft keeps scrolling reversible until the user confirms the selected date. */
export function DateTimePicker({ id, value, mode, min, max, zone, locale, onCancel, onApply }: {
  id: string; value: string; mode: DateEntryMode; min?: string | undefined; max?: string | undefined; zone: string; locale?: string | undefined;
  onCancel: () => void; onApply: (value: string) => void;
}) {
  const m = createMessages(locale);
  const [parts, setParts] = useState(() => {
    const now = new Date(), today = `${String(now.getFullYear()).padStart(4, "0")}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
    const time = `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;
    return constrainDatePicker(datePickerParts(value || (mode === "time" ? time : mode === "date" ? today : `${today}T${time}`), mode), mode, min, max);
  });
  const selected = datePickerValue(parts, mode);
  let error = "";
  if (mode === "datetime") {
    try { dateTimeIntervalRange({ from: selected, to: selected }, zone); } catch { error = m.text("dateField.nonexistent"); }
  }
  const column = (part: DatePickerPart) => {
    const [minimum, maximum] = datePickerPartBounds(parts, part, mode, min, max);
    return <ScrollPickerColumn key={part} label={m.text(`dateField.${part}Label`)} value={parts[part]} minimum={minimum} maximum={maximum}
      previousLabel={m.text("dateField.previous", { part: m.text(`dateField.${part}Label`) })} nextLabel={m.text("dateField.next", { part: m.text(`dateField.${part}Label`) })}
      format={part === "month" ? value => shortMonths[value - 1]! : part === "year" ? value => String(value).padStart(4, "0") : twoDigits}
      onChange={value => setParts(current => constrainDatePicker({ ...current, [part]: value }, mode, min, max))} />;
  };
  return <CriteriaDialog id={id} open title={m.text(mode === "time" ? "dateField.chooseTime" : "dateField.chooseDate")}
    onCancel={onCancel} closeLabel={m.text("feed.filters.close")} cancelLabel={m.text("feed.filters.cancel")}
    applyLabel={m.text("dateField.useSelection")} applyDisabled={!!error} onApply={() => { if (!error) onApply(selected); }}>
    <div data-date-time-picker={mode}>
      <Preview aria-live="polite">{formatDateEntry(selected, mode)}</Preview>
      <Columns data-mode={mode}>{mode === "time" ? <>{column("hour")}{column("minute")}</> : <>{column("day")}{column("month")}{column("year")}</>}</Columns>
      {mode === "datetime" && <TimeColumns>{column("hour")}{column("minute")}</TimeColumns>}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </div>
  </CriteriaDialog>;
}
