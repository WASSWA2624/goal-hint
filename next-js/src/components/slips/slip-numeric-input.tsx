"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import styled from "styled-components";
import { Field, FieldLabel, FieldMessage, hasContent, InputControl, useFieldAccessibility, type TextInputProps } from "@/components/ui/controls";
import { ChevronDownIcon } from "@/components/ui/icons";
import { FloatingOutline } from "@/components/ui/floating-outline";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { floatingControl, floatingFieldState, floatingLabel, floatingOutline } from "@/components/ui/floating-field-styles";
import { commitSlipNumber, slipNumericRule, stepSlipNumber,
  type SlipNumberGuardResult, type SlipNumericField } from "@/domain/slip-input-guards";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const NumericField = styled(Field)`
  position: relative; margin-block-start: var(--gh-spacing-1_5);
  &&[data-slip-floating-field="true"] {
    gap: 0;
    > label { ${floatingLabel} }
    > input:not([type="hidden"]) { ${floatingControl} border: var(--gh-stroke-thin) solid transparent; &:focus-visible { outline: none; } }
    > [data-floating-outline] { ${floatingOutline} }
    ${floatingFieldState}
  }
`;
const NumericControl = styled(InputControl)`
  text-align: center;
  @media (pointer: fine) { &&[data-slip-number-enhanced="true"] { padding-inline: var(--gh-spacing-2) var(--gh-spacing-5); } }
  ${media.belowDesktop} { &&[data-slip-number-enhanced="true"] { padding-inline: var(--gh-spacing-0_75); } }
`;
const Stepper = styled.span`
  display: none; position: absolute; inset-inline-end: var(--gh-spacing-0_25); inset-block-end: var(--gh-spacing-0_25);
  inline-size: var(--gh-size-4_5); block-size: calc(var(--form-control-height) - var(--gh-size-0_5)); opacity: 0;
  @media (pointer: fine) {
    display: flex; flex-direction: column;
    ${NumericField}:hover > &, ${NumericField}:focus-within > & { opacity: 1; }
  }
  &&& > button {
    flex: 1 1 50%; inline-size: 100%; min-inline-size: 0; block-size: 50%; min-block-size: 0;
    max-block-size: 50%; margin: 0; padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none};
    font-size: var(--gh-font-micro); line-height: var(--gh-leading-solid);
  }
  &&& > button > svg { inline-size: var(--gh-size-2_5); block-size: var(--gh-size-2_5); }
  &&& > button[data-step-up] > svg { transform: rotate(180deg); }
  ${media.belowDesktop} { display: none; }
`;
const StepButton = styled.button`
  display: flex; align-items: center; justify-content: center; flex: 1; min-block-size: 0;
  padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.control}; color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted}; font-size: var(--gh-font-micro); line-height: var(--gh-leading-solid); cursor: pointer;
  &:hover, &:focus-visible { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
  &:focus-visible { outline: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_25)); }
  &:disabled { cursor: not-allowed; }
`;
const Warning = styled.span`
  position: fixed; inset: auto; z-index: var(--gh-layer-modal); margin: 0; padding: var(--gh-spacing-1_5) var(--gh-spacing-2);
  inline-size: max-content; max-inline-size: min(var(--gh-size-80), calc(100vw - var(--gh-size-4)));
  color: ${({ theme }) => theme.color.outcome.incorrect.text}; background: ${({ theme }) => theme.color.outcome.incorrect.background};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); overflow-wrap: anywhere;
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
  rangeError?: (value: string) => string | undefined;
  validationMessage?: string | undefined;
};

export function slipNumberErrorMessage(messages: ReturnType<typeof createMessages>, result: Extract<SlipNumberGuardResult, { accepted: false }>) {
  return messages.text(result.issue === "whole-number" ? "slips.guard.wholeNumber" : `slips.guard.${result.issue}`,
    { limit: result.limit ?? "", count: result.limit ?? "" });
}

type Feedback = { key: number; kind: "editing" | "range" } | { key: number; kind: "value" | "step"; message: string };

/** Check bounds without interrupting the browser's text editing. */
export function SlipNumericInput({ field: name, value, locale, onValueChange, rangeError, feedbackKey = 0, validationMessage, label, hint, error,
  onKeyDown, onBlur, ...props }: SlipNumericInputProps) {
  const messages = createMessages(locale), rule = slipNumericRule(name);
  const enhanced = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const input = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const accessibility = useFieldAccessibility({ ...props, hint, error });
  const warningId = `${accessibility.id}-guard`, parsed = commitSlipNumber(name, value);
  const activeFeedback = feedback?.key === feedbackKey && !accessibility.isInvalid ? feedback : null;
  let warning = validationMessage;
  if (!warning && activeFeedback) {
    if (activeFeedback.kind === "editing") {
      const text = value.trim();
      if (text && !text.endsWith(".")) {
        if (parsed.accepted) warning = rangeError?.(parsed.value);
        else if (parsed.issue === "minimum" || parsed.issue === "maximum") warning = slipNumberErrorMessage(messages, parsed);
      }
    } else if (activeFeedback.kind === "range") warning = rangeError?.(value);
    else if ("message" in activeFeedback) warning = activeFeedback.message;
  }
  const invalid = Boolean(warning) && activeFeedback?.kind !== "step";
  const accessibleLabel = String(props["aria-label"] ?? props.name ?? name);
  const describedBy = [accessibility.describedBy, warning ? warningId : ""].filter(Boolean).join(" ") || undefined;
  function step(direction: 1 | -1) {
    if (props.disabled || props.readOnly) return;
    const result = stepSlipNumber(name, value, direction);
    if (!result.accepted) {
      setFeedback({ key: feedbackKey, kind: "step", message: slipNumberErrorMessage(messages, result) });
      return;
    }
    onValueChange(result.value); setFeedback(null);
  }
  function validate(raw: string) {
    const result = commitSlipNumber(name, raw);
    setFeedback(!result.accepted ? { key: feedbackKey, kind: "value", message: slipNumberErrorMessage(messages, result) }
      : rangeError?.(result.value) ? { key: feedbackKey, kind: "range" } : null);
  }
  return <NumericField data-slip-numeric-container={name} data-slip-floating-field="true" data-floating-control data-floating-filled={value !== ""}>
    {hasContent(label) && <FieldLabel htmlFor={accessibility.id}>{label}</FieldLabel>}
    <FloatingOutline label={label} />
    <NumericControl {...props} ref={input} id={accessibility.id} data-slip-numeric-field={name} data-slip-number-enhanced={enhanced}
      type={enhanced ? "text" : "number"}
      inputMode={rule.precision === 0 ? "numeric" : "decimal"} value={value} autoComplete="off" placeholder=" " spellCheck={false}
      min={props.min ?? rule.minimum} max={props.max ?? rule.maximum} step={props.step ?? rule.step}
      role={enhanced ? "spinbutton" : undefined} aria-valuemin={enhanced ? Number(rule.minimum) : undefined}
      aria-valuemax={enhanced ? Number(rule.maximum) : undefined}
      aria-valuenow={enhanced && parsed.accepted && parsed.value !== "" ? Number(parsed.value) : undefined}
      aria-valuetext={enhanced ? value || props.placeholder : undefined}
      aria-invalid={accessibility.invalid || invalid || undefined} aria-describedby={describedBy}
      $invalid={accessibility.isInvalid || invalid}
      onChange={(event) => {
        setFeedback({ key: feedbackKey, kind: "editing" });
        onValueChange(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        const native = event.nativeEvent;
        if (event.defaultPrevented || native.isComposing || native.keyCode === 229 || props.readOnly || !enhanced
          || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); step(event.key === "ArrowUp" ? 1 : -1);
        }
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (!props.readOnly) validate(event.currentTarget.value);
      }} />
    {enhanced && <Stepper data-slip-number-stepper>
      <StepButton type="button" tabIndex={-1} aria-label={messages.text("slips.guard.increase", { label: accessibleLabel })} disabled={props.disabled || props.readOnly}
        onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)} data-step-up><ChevronDownIcon aria-hidden="true" /></StepButton>
      <StepButton type="button" tabIndex={-1} aria-label={messages.text("slips.guard.decrease", { label: accessibleLabel })} disabled={props.disabled || props.readOnly}
        onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}><ChevronDownIcon aria-hidden="true" /></StepButton>
    </Stepper>}
    <SlipInputWarning message={warning ?? null} anchorRef={input} id={warningId} />
    {accessibility.hasHint && <FieldMessage id={accessibility.hintId}>{hint}</FieldMessage>}
    {accessibility.hasError && <FieldMessage id={accessibility.errorId} $error>{error}</FieldMessage>}
  </NumericField>;
}
