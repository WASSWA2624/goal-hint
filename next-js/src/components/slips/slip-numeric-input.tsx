"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import styled from "styled-components";
import { Field, FieldLabel, FieldMessage, InputControl, useFieldAccessibility, type TextInputProps } from "@/components/ui/controls";
import { createMessages } from "@/i18n/messages";
import { formatSlipMatchCount, guardSlipNumber, normalizeSlipMatchCount, slipNumericRule, stepSlipNumber,
  type SlipNumberGuardResult, type SlipNumericField } from "@/domain/slip-input-guards";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const NumericField = styled(Field)`position: relative;`;
const NumericControl = styled(InputControl)`
  @media (pointer: fine) { &&[data-slip-number-enhanced="true"] { padding-inline-end: 17px; } }
`;
const Stepper = styled.span`
  display: none; position: absolute; inset-inline-end: 1px; inset-block-end: 1px;
  inline-size: 14px; block-size: calc(2rem - 2px); opacity: 0;
  @media (pointer: fine) {
    display: flex; flex-direction: column;
    ${NumericField}:hover > &, ${NumericField}:focus-within > & { opacity: 1; }
  }
`;
const StepButton = styled.button`
  display: flex; align-items: center; justify-content: center; flex: 1; min-block-size: 0;
  padding: 0; border: 0; border-radius: 0; color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 0.5rem; line-height: 1; cursor: pointer;
  &:hover, &:focus-visible { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
  &:focus-visible { outline: 1px solid ${({ theme }) => theme.color.focus}; outline-offset: -1px; }
  &:disabled { cursor: not-allowed; }
`;
const Warning = styled.span`
  position: fixed; inset: auto; z-index: 1000; margin: 0; padding: 6px 8px;
  inline-size: max-content; max-inline-size: min(20rem, calc(100vw - 16px));
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.outcome.incorrect.border};
  border-radius: 0; font-size: 0.75rem; line-height: 1.4; overflow-wrap: anywhere;
  pointer-events: none;
`;

/** A top-layer field message does not move controls or get clipped by a criteria dialog. */
export function SlipInputWarning({ message, anchorRef, id }: {
  message: string | null; anchorRef: RefObject<HTMLInputElement | null>; id: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const notice = ref.current, anchor = anchorRef.current;
    if (!notice || !anchor || !message) return;
    const native = typeof notice.showPopover === "function";
    if (native) notice.showPopover();
    function position() {
      if (!notice || !anchor) return;
      const box = anchor.getBoundingClientRect(), size = notice.getBoundingClientRect();
      notice.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
      notice.style.top = `${Math.max(8, box.bottom + size.height + 6 <= window.innerHeight ? box.bottom + 6 : box.top - size.height - 6)}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      if (native && notice.matches(":popover-open")) notice.hidePopover();
    };
  }, [message, anchorRef]);
  return <Warning ref={ref} id={id} data-slip-input-warning popover="manual" hidden={!message}
    role="status" aria-live="polite" aria-atomic="true">{message}</Warning>;
}

export type SlipNumericInputProps = Omit<TextInputProps, "type" | "value" | "onChange" | "onCommit" | "leading" | "trailing"> & {
  field: SlipNumericField; value: string; locale: string; onValueChange: (value: string) => void;
  /** Opening, cancelling or resetting a group dismisses feedback even when its value is unchanged. */
  feedbackKey?: number;
  /** Pair ordering is validated separately so editing either bound never traps the other. */
  onCommit?: (value: string) => string | undefined;
};

function formattedCaret(raw: string, caret: number, formatted: string, grouped: boolean) {
  if (!grouped) return Math.max(0, Math.min(formatted.length, formatted.length - raw.length + caret));
  let remaining = raw.slice(caret).replace(/\D/gu, "").length, position = formatted.length;
  while (remaining > 0 && position > 0) { position -= 1; if (/\d/u.test(formatted[position]!)) remaining -= 1; }
  return position;
}

/** Progressive numeric editing keeps one canonical form value and the existing field geometry. */
export function SlipNumericInput({ field: name, value, locale, onValueChange, onCommit, feedbackKey = 0, label, hint, error,
  onKeyDown, onPaste, onBeforeInput, onBlur, onFocus, onDrop,
  onCompositionStart, onCompositionEnd, ...props }: SlipNumericInputProps) {
  const messages = createMessages(locale), rule = slipNumericRule(name);
  const enhanced = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const input = useRef<HTMLInputElement>(null), composing = useRef(false);
  const initial = guardSlipNumber(name, value, true);
  const caret = useRef<number | null>(null), lastComplete = useRef(initial.accepted && initial.complete ? initial.value : rule.minimum);
  const [warning, setWarning] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  const [pairWarning, setPairWarning] = useState(false);
  const [feedbackEpoch, setFeedbackEpoch] = useState(feedbackKey);
  const [composition, setComposition] = useState<{ key: number; value: string } | null>(null);
  const accessibility = useFieldAccessibility({ ...props, hint, error });
  const warningId = `${accessibility.id}-guard`, display = enhanced && rule.grouped ? formatSlipMatchCount(value) : value;
  const compositionDraft = composition?.key === feedbackKey ? composition.value : null;
  const parsed = guardSlipNumber(name, value, true);
  const currentPairWarning = feedbackEpoch === feedbackKey && pairWarning ? onCommit?.(value) : undefined;
  const shownWarning = feedbackEpoch !== feedbackKey ? null : pairWarning ? currentPairWarning ?? null : warning;
  const accessibleLabel = String(props["aria-label"] ?? props.name ?? name);
  const describedBy = [accessibility.describedBy, shownWarning ? warningId : ""].filter(Boolean).join(" ") || undefined;
  useLayoutEffect(() => {
    if (caret.current !== null && input.current && enhanced) {
      input.current.setSelectionRange(caret.current, caret.current); caret.current = null;
    }
  }, [display, enhanced]);
  useEffect(() => {
    const checked = guardSlipNumber(name, value, true);
    if (checked.accepted && checked.complete) lastComplete.current = checked.value;
  }, [name, value]);
  useEffect(() => {
    if (!warning || pairWarning) return;
    const timer = window.setTimeout(() => setWarning(null), 4000);
    return () => window.clearTimeout(timer);
  }, [attempt, warning, pairWarning]);
  function notify(text: string) { setFeedbackEpoch(feedbackKey); setPairWarning(false); setWarning(text); setAttempt((current) => current + 1); }
  function reject(result: Extract<SlipNumberGuardResult, { accepted: false }>) {
    notify(messages.text(result.issue === "whole-number" ? "slips.guard.wholeNumber" : `slips.guard.${result.issue}`,
      { limit: result.limit ?? "", count: result.limit ?? "" }));
  }
  function accept(raw: string, position = raw.length) {
    setComposition(null);
    const canonical = rule.grouped ? raw.replaceAll(",", "") : raw;
    const result = guardSlipNumber(name, canonical);
    if (!result.accepted) { reject(result); return false; }
    const nextDisplay = rule.grouped ? formatSlipMatchCount(result.value) : result.value;
    caret.current = formattedCaret(raw, position, nextDisplay, rule.grouped);
    onValueChange(result.value); setWarning(null); setPairWarning(false);
    // A rejected native edit or formatting-only change might not trigger a parent render.
    if (input.current && result.value === value) {
      input.current.value = nextDisplay;
      input.current.setSelectionRange(caret.current, caret.current); caret.current = null;
    }
    return true;
  }
  function step(direction: 1 | -1) {
    if (props.disabled || props.readOnly) return;
    const raw = compositionDraft === null ? value : rule.grouped ? compositionDraft.replaceAll(",", "") : compositionDraft;
    setComposition(null);
    const result = stepSlipNumber(name, raw, direction);
    if (!result.accepted) { reject(result); return; }
    onValueChange(result.value); setWarning(null); setPairWarning(false);
  }
  function replaceSelection(text: string, pasted = false) {
    const control = input.current;
    if (!control) return false;
    const content = pasted ? text.trim() : text;
    const inserted = pasted && rule.grouped ? normalizeSlipMatchCount(content) : content;
    if (inserted === null) { reject({ accepted: false, issue: "whole-number" }); return false; }
    const current = control.value, start = control.selectionStart ?? current.length, end = control.selectionEnd ?? start;
    return accept(current.slice(0, start) + inserted + current.slice(end), start + inserted.length);
  }
  function commit(candidate = value) {
    setFeedbackEpoch(feedbackKey);
    setComposition(null);
    const result = guardSlipNumber(name, candidate, true);
    if (!result.accepted) {
      reject(result); onValueChange(lastComplete.current); return;
    }
    if (result.value !== value) onValueChange(result.value);
    const pair = onCommit?.(result.value);
    if (pair) { setPairWarning(true); setWarning(pair); }
    else { setPairWarning(false); setWarning(null); }
  }
  return <NumericField data-slip-numeric-container={name}>
    <FieldLabel htmlFor={accessibility.id}>{label}</FieldLabel>
    <NumericControl {...props} ref={input} id={accessibility.id} data-slip-numeric-field={name} data-slip-number-enhanced={enhanced}
      type={enhanced ? "text" : "number"} name={enhanced ? undefined : props.name}
      inputMode={rule.precision === 0 ? "numeric" : "decimal"} value={compositionDraft ?? display} autoComplete="off" spellCheck={false}
      min={props.min ?? rule.minimum} max={props.max ?? rule.maximum} step={props.step ?? rule.step}
      role={enhanced ? "spinbutton" : undefined} aria-valuemin={enhanced ? Number(rule.minimum) : undefined}
      aria-valuemax={enhanced ? Number(rule.maximum) : undefined}
      aria-valuenow={enhanced && parsed.accepted && value !== "" ? Number(value) : undefined}
      aria-valuetext={enhanced ? display || props.placeholder : undefined}
      aria-invalid={accessibility.invalid || Boolean(currentPairWarning) || undefined} aria-describedby={describedBy}
      $invalid={accessibility.isInvalid || Boolean(currentPairWarning)}
      onChange={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (native.isComposing) {
          composing.current = true; setComposition({ key: feedbackKey, value: event.currentTarget.value }); return;
        }
        // Controlled restoration can cancel an IME without compositionend; later input must still work.
        composing.current = false;
        const control = event.currentTarget, raw = control.value, position = control.selectionStart ?? raw.length;
        const inputType = native.inputType;
        if (!accept(raw, position)) control.value = display;
        else if (rule.grouped && raw !== display && raw.replaceAll(",", "") === value) {
          // Mobile keyboards can delete a separator without dispatching a Backspace/Delete key.
          if (inputType === "deleteContentBackward") control.setSelectionRange(position, position);
          else if (inputType === "deleteContentForward") control.setSelectionRange(position + 1, position + 1);
        }
      }}
      onBeforeInput={(event) => {
        onBeforeInput?.(event);
        if (event.defaultPrevented || composing.current || !enhanced) return;
        const native = event.nativeEvent as InputEvent;
        if (native.inputType?.startsWith("insert") && native.data) {
          const current = event.currentTarget.value;
          const start = event.currentTarget.selectionStart ?? current.length, end = event.currentTarget.selectionEnd ?? start;
          const candidate = current.slice(0, start) + native.data + current.slice(end);
          const checked = guardSlipNumber(name, rule.grouped ? candidate.replaceAll(",", "") : candidate);
          if (rule.grouped && native.data.includes(",")) { event.preventDefault(); reject({ accepted: false, issue: "whole-number" }); }
          else if (!checked.accepted) { event.preventDefault(); reject(checked); }
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        const native = event.nativeEvent;
        if (event.defaultPrevented || native.isComposing || native.keyCode === 229 || props.readOnly || !enhanced) return;
        composing.current = false;
        const current = event.currentTarget.value, start = event.currentTarget.selectionStart, end = event.currentTarget.selectionEnd;
        // Formatting separators must not trap repeated deletion at an otherwise unchanged value.
        if (rule.grouped && !event.ctrlKey && !event.metaKey && !event.altKey && start !== null && start === end && event.key === "Backspace" && current[start - 1] === ",") {
          event.preventDefault(); accept(current.slice(0, start - 2) + current.slice(start), start - 2);
        }
        else if (rule.grouped && !event.ctrlKey && !event.metaKey && !event.altKey && start !== null && start === end && event.key === "Delete" && current[start] === ",") {
          event.preventDefault(); accept(current.slice(0, start) + current.slice(start + 2), start);
        }
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); step(event.key === "ArrowUp" ? 1 : -1); }
        else if (event.key === "Escape") { setComposition(null); setWarning(null); setPairWarning(false); }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (!(rule.precision === 0 ? /^\d$/u : /^[\d.]$/u).test(event.key)) {
            event.preventDefault(); reject({ accepted: false, issue: rule.precision === 0 ? "whole-number" : "number" });
          }
        }
      }}
      onPaste={(event) => {
        onPaste?.(event);
        if (event.defaultPrevented || props.readOnly || !enhanced) return;
        event.preventDefault(); replaceSelection(event.clipboardData.getData("text/plain"), true);
      }}
      onDrop={(event) => {
        onDrop?.(event);
        if (event.defaultPrevented || props.readOnly || !enhanced) return;
        event.preventDefault(); replaceSelection(event.dataTransfer.getData("text/plain"), true);
      }}
      onCompositionStart={(event) => { composing.current = true; onCompositionStart?.(event); }}
      onCompositionEnd={(event) => {
        composing.current = false; onCompositionEnd?.(event);
        if (!accept(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)) event.currentTarget.value = display;
      }}
      onFocus={(event) => { composing.current = false; onFocus?.(event); }}
      onBlur={(event) => {
        composing.current = false; onBlur?.(event);
        commit(compositionDraft === null ? value : rule.grouped ? event.currentTarget.value.replaceAll(",", "") : event.currentTarget.value);
      }} />
    {enhanced && <input type="hidden" name={props.name} value={value} disabled={props.disabled} />}
    {enhanced && <Stepper data-slip-number-stepper>
      <StepButton type="button" tabIndex={-1} aria-label={messages.text("slips.guard.increase", { label: accessibleLabel })} disabled={props.disabled || props.readOnly}
        onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)}>▴</StepButton>
      <StepButton type="button" tabIndex={-1} aria-label={messages.text("slips.guard.decrease", { label: accessibleLabel })} disabled={props.disabled || props.readOnly}
        onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}>▾</StepButton>
    </Stepper>}
    <SlipInputWarning message={shownWarning} anchorRef={input} id={warningId} />
    {accessibility.hasHint && <FieldMessage id={accessibility.hintId}>{hint}</FieldMessage>}
    {accessibility.hasError && <FieldMessage id={accessibility.errorId} $error>{error}</FieldMessage>}
  </NumericField>;
}
