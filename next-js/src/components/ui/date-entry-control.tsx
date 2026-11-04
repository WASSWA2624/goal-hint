"use client";

import { Fragment, useRef, type ComponentPropsWithRef } from "react";
import styled from "styled-components";
import { parseDateEntry, type DateEntryMode } from "@/domain/date-entry";
import { changeDateEntryPart, dateEntryPartsByMode, splitDateEntry, type DateEntryPart, type DateEntryParts } from "@/domain/date-entry-segments";
import { createMessages } from "@/i18n/messages";
import { textFieldSurface } from "./filled-surfaces";
import { floatingControl } from "./floating-field-styles";

const Segments = styled.div`
  ${floatingControl}
  ${textFieldSurface}
  display: flex; align-items: center; overflow: hidden;
  padding: 0 var(--gh-size-10) 0 var(--gh-spacing-2);
  border-color: transparent; border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-body); font-variant-numeric: tabular-nums;
  && > input {
    flex: 0 1 auto; min-inline-size: 0; inline-size: var(--gh-size-5); block-size: 100%;
    margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent;
    color: inherit; font: inherit; text-align: center;
    &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
    &:focus-visible { outline: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-stroke-thin)); }
  }
  && > [data-date-part="month"] { inline-size: var(--gh-size-8); }
  && > [data-date-part="year"] { inline-size: var(--gh-size-8); }
  > span { flex: none; white-space: pre; }
  &:has(:disabled) { background: ${({ theme }) => theme.textField.disabledBackground}; color: ${({ theme }) => theme.color.disabledText}; }
  &[data-empty="true"]:not(:focus-within) {
    color: transparent;
    && > input::placeholder { color: transparent; }
  }
`;

const placeholders = { day: "DD", month: "MMM", year: "YYYY", hour: "HH", minute: "mm" };
const separators: Partial<Record<DateEntryPart, string>> = { day: "-", month: "-", year: " ", hour: ":" };

type DateEntryControlProps = Omit<ComponentPropsWithRef<"input">, "onChange" | "type" | "value"> & {
  id: string; mode: DateEntryMode; locale?: string | undefined; value: string; parts: DateEntryParts;
  onPartsChange: (parts: DateEntryParts) => void;
};

/** A group behaves like one form field while the browser edits individual segments. */
export function DateEntryControl({ id, mode, locale, parts, value, onPartsChange, ref, disabled, readOnly,
  onFocus, onBlur, onKeyDown, onPaste, title, "aria-invalid": invalid, "aria-describedby": description, ...inputProps }: DateEntryControlProps) {
  const group = useRef<HTMLDivElement>(null), m = createMessages(locale);
  const fields = dateEntryPartsByMode[mode];
  return <Segments ref={group} role="group" aria-labelledby={`${id}-label`}
    data-date-time-input={mode} data-empty={value === ""} title={title} dir="ltr">
    {fields.map((part, index) => {
      const separator = index < fields.length - 1 ? separators[part] : undefined;
      return <Fragment key={part}>
        <input {...(index === 0 ? inputProps : {})} ref={index === 0 ? ref : undefined} id={index === 0 ? id : `${id}-${part}`}
          type="text" value={parts[part]} data-date-part={part} disabled={disabled} readOnly={readOnly}
          aria-label={m.text(`dateField.${part}Label`)} aria-invalid={invalid} aria-describedby={description}
          placeholder={placeholders[part]} inputMode={part === "month" ? "text" : "numeric"}
          autoComplete="off" spellCheck={false} autoCapitalize="characters"
          onFocus={event => { event.currentTarget.select(); if (!group.current?.contains(event.relatedTarget)) onFocus?.(event); }}
          onClick={event => { event.currentTarget.select(); if (index === 0) inputProps.onClick?.(event); }}
          onBlur={event => { if (!group.current?.contains(event.relatedTarget)) onBlur?.(event); }}
          onKeyDown={event => {
            onKeyDown?.(event);
            if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && event.key === separator) {
              event.preventDefault();
              group.current?.querySelectorAll("input")[index + 1]?.focus();
            }
          }}
          onPaste={event => {
            onPaste?.(event);
            if (event.defaultPrevented || readOnly || disabled) return;
            const paste = parseDateEntry(event.clipboardData.getData("text"), mode);
            if (paste.value) { event.preventDefault(); onPartsChange(splitDateEntry(paste.value, mode)); }
          }}
          onChange={event => {
            const next = changeDateEntryPart(parts, part, event.currentTarget.value);
            if (next) onPartsChange(next);
          }} />
        {separator && <span data-date-separator aria-hidden="true">{separator}</span>}
      </Fragment>;
    })}
  </Segments>;
}
