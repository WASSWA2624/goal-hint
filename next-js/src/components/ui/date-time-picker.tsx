"use client";

import { useState } from "react";
import styled from "styled-components";
import { shortMonths, formatDateEntry, type DateEntryMode } from "@/domain/date-entry";
import { constrainDatePicker, datePickerParts, datePickerValue, datePickerPartBounds, type DatePickerPart } from "@/domain/date-picker";
import { dateTimeIntervalRange } from "@/domain/date-time";
import { createMessages } from "@/i18n/messages";
import { CriteriaDialog, CriteriaDialogButton } from "./criteria-dialog";
import { CalendarIcon, CheckIcon, ClockIcon } from "./icons";
import { ScrollPickerColumn } from "./scroll-picker-column";

export const pickerTitleKey = {
  date: "dateField.chooseDate",
  datetime: "dateField.chooseDateTime",
  time: "dateField.chooseTime",
} as const;

const PickerDialog = styled(CriteriaDialog)<{ $mode: DateEntryMode }>`
  && { inline-size: min(${({ $mode }) => $mode === "datetime" ? "var(--gh-size-96)" : $mode === "date" ? "var(--gh-size-72)" : "var(--gh-size-64)"}, calc(100vw - var(--gh-size-6))); }
  > div { padding-block: var(--gh-spacing-2); }
`;
const Title = styled.span`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5);
  > svg { flex: none; inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); color: ${({ theme }) => theme.color.link}; }
`;
const Columns = styled.div`
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: var(--gh-spacing-1);
`;
const Preview = styled.p`
  margin: 0 0 var(--gh-spacing-2); text-align: center; font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium); font-variant-numeric: tabular-nums;
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
      wrap={part === "day" || part === "month"}
      previousLabel={m.text("dateField.previous", { part: m.text(`dateField.${part}Label`) })} nextLabel={m.text("dateField.next", { part: m.text(`dateField.${part}Label`) })}
      format={part === "month" ? value => shortMonths[value - 1]! : part === "year" ? value => String(value).padStart(4, "0") : twoDigits}
      onChange={value => setParts(current => constrainDatePicker({ ...current, [part]: value }, mode, min, max))} />;
  };
  return <PickerDialog $mode={mode} id={id} open
    title={<Title>{mode === "time" ? <ClockIcon /> : <CalendarIcon />}{m.text(pickerTitleKey[mode])}</Title>}
    onCancel={onCancel} closeLabel={m.text("feed.filters.close")}
    footer={<>
      <CriteriaDialogButton type="button" variant="quiet" onClick={onCancel}>{m.text("feed.filters.cancel")}</CriteriaDialogButton>
      <CriteriaDialogButton type="button" disabled={!!error} onClick={() => onApply(selected)}>
        <CheckIcon />{m.text("dateField.useSelection")}
      </CriteriaDialogButton>
    </>}>
    <div data-date-time-picker={mode}>
      <Preview aria-live="polite">{formatDateEntry(selected, mode)}</Preview>
      <Columns>
        {mode !== "time" && <>{column("day")}{column("month")}{column("year")}</>}
        {mode !== "date" && <>{column("hour")}{column("minute")}</>}
      </Columns>
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </div>
  </PickerDialog>;
}
