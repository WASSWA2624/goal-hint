"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref } from "react";
import styled from "styled-components";
import { dateEntryFormat, formatDateEntry, type DateEntryMode } from "@/domain/date-entry";
import { normalizeDateEntryParts, parseDateEntryParts, splitDateEntry, type DateEntryParts } from "@/domain/date-entry-segments";
import { dateTimeIntervalRange } from "@/domain/date-time";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { TextInput, type TextInputProps } from "./controls";
import { FloatingField } from "./floating-field";
import { CalendarIcon, ClockIcon } from "./icons";
import { DateTimePicker, pickerTitleKey } from "./date-time-picker";
import { DateEntryControl } from "./date-entry-control";

export type DateTimeFieldProps = Omit<TextInputProps, "type" | "onChange" | "leading" | "trailing"> & {
  mode?: DateEntryMode; locale?: string; timeZone?: string; onValueChange?: (value: string) => void;
};
const subscribe = () => () => {}, browserSnapshot = () => true, serverSnapshot = () => false;
const Field = styled.div`
  position: relative; min-inline-size: 0; max-inline-size: 100%;
`;
const PickerButton = styled.button`
  display: grid; place-items: center; min-inline-size: 0; min-block-size: 0; inline-size: var(--gh-size-8);
  padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.control};
  background: transparent; color: ${({ theme }) => theme.color.link}; cursor: pointer;
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
`;
function assignRef(ref: Ref<HTMLInputElement> | undefined, value: HTMLInputElement | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/** Formatted entry and calendar picking share one canonical value and inline validation. */
export function DateTimeField({ mode = "date", locale, timeZone, label, title, value, defaultValue, onValueChange, error, hint, min, max,
  name, id: suppliedId, ref, className, required, disabled, readOnly, step, onBlur, onInvalid, onFocus, ...props }: DateTimeFieldProps) {
  const deviceZone = useDeviceTimeZone(), zone = timeZone ?? deviceZone;
  const generated = useId(), id = suppliedId ?? generated, m = createMessages(locale);
  const enhanced = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const [internal, setInternal] = useState(String(defaultValue ?? ""));
  const source = value === undefined ? internal : String(value ?? "");
  const [edit, setEdit] = useState<{ source: string; parts: DateEntryParts } | null>(null);
  const [focused, setFocused] = useState(false), [touched, setTouched] = useState(false), [attempted, setAttempted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const parts = edit?.source === source ? edit.parts : splitDateEntry(source, mode);
  const parsed = parseDateEntryParts(parts, mode), format = dateEntryFormat(mode);
  const issue = parsed.issue === "empty" && !required ? null : parsed.issue;
  let message = issue ? m.text(issue === "day" ? "dateField.day" : issue === "month" ? "dateField.month"
    : issue === "time" ? "dateField.time" : issue === "date" ? "dateField.date" : "dateField.format", { format }) : "";
  if (!issue && parsed.value) {
    if (min !== undefined && parsed.value < String(min)) message = m.text("dateField.minimum", { value: formatDateEntry(String(min), mode) });
    else if (max !== undefined && parsed.value > String(max)) message = m.text("dateField.maximum", { value: formatDateEntry(String(max), mode) });
    else if (mode === "datetime") {
      try { dateTimeIntervalRange({ from: parsed.value, to: parsed.value }, zone); }
      catch { message = m.text("dateField.nonexistent"); }
    }
  }
  if (disabled) message = "";
  const validity = error ? typeof error === "string" ? error : m.text("dateField.check") : message;
  const show = !disabled && (!!error || !!message && (!(issue === "incomplete" || issue === "empty") || attempted || touched && !focused));
  const canonical = message ? "" : parsed.value;
  useLayoutEffect(() => { input.current?.setCustomValidity(validity); }, [validity, enhanced]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = (event: Event) => queueMicrotask(() => {
      if (!event.defaultPrevented) { setInternal(String(defaultValue ?? "")); setEdit(null); setTouched(false); setAttempted(false); }
    });
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, enhanced]);
  function change(parts: DateEntryParts) {
    setAttempted(false);
    const checked = parseDateEntryParts(parts, mode);
    let next = checked.value;
    if (checked.issue || min !== undefined && next < String(min) || max !== undefined && next > String(max)) next = "";
    if (next && mode === "datetime") {
      try { dateTimeIntervalRange({ from: next, to: next }, zone); } catch { next = ""; }
    }
    setEdit({ source: next, parts });
    if (value === undefined) setInternal(next);
    if (next !== source) onValueChange?.(next);
  }
  const type = mode === "datetime" ? "datetime-local" : mode;
  if (!enhanced) return <TextInput {...props} ref={ref} id={id} className={className} label={label} name={name} type={type}
    value={value} defaultValue={defaultValue} title={title} hint={hint} error={error} min={min} max={max} required={required}
    disabled={disabled} readOnly={readOnly} step={step ?? (mode === "date" ? undefined : 60)} onChange={event => onValueChange?.(event.target.value)} />;
  return <Field className={className} data-date-time-field={mode}>
    {name && <input type="hidden" name={name} value={canonical} disabled={disabled} />}
    <FloatingField label={label} hint={hint} error={show ? <span role="alert">{error || message}</span> : undefined}
      trailing={<PickerButton type="button" data-date-time-picker-trigger aria-label={m.text(pickerTitleKey[mode])}
        aria-haspopup="dialog" aria-expanded={pickerOpen} disabled={disabled || readOnly} onClick={() => setPickerOpen(true)}>
        {mode === "time" ? <ClockIcon /> : <CalendarIcon />}</PickerButton>}>
      <DateEntryControl {...props} ref={element => { input.current = element; assignRef(ref, element); }} id={id} mode={mode} locale={locale}
        parts={parts} value={Object.values(parts).join("")} required={required} disabled={disabled} readOnly={readOnly}
        title={title ?? `${format}${mode === "datetime" ? ` · ${zone}` : ""}`} aria-invalid={show || props["aria-invalid"] || undefined}
        onFocus={event => { setFocused(true); onFocus?.(event); }} onPartsChange={change}
        onBlur={event => { setFocused(false); setTouched(true); setEdit({ source, parts: normalizeDateEntryParts(parts) }); onBlur?.(event); }}
        onInvalid={event => { event.preventDefault(); setTouched(true); setAttempted(true); onInvalid?.(event); }} />
    </FloatingField>
    {pickerOpen && <DateTimePicker id={`${id}-picker`} value={canonical} mode={mode} locale={locale} zone={zone}
      min={min === undefined ? undefined : String(min)} max={max === undefined ? undefined : String(max)}
      onCancel={() => setPickerOpen(false)} onApply={value => { change(splitDateEntry(value, mode)); setPickerOpen(false); }} />}
  </Field>;
}
