"use client";

import { useEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { TextAction, visuallyHidden } from "./desk-styles";

type CopyTextButtonProps = {
  value: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
};
type CopyFeedback = { value: string; status: "copied" | "failed" };

/** Retain a one-click copy action in browsers without the asynchronous clipboard API. */
async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; }
    catch { /* A permitted user-initiated legacy copy can still succeed. */ }
  }
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.cssText = "position:fixed;inset:0;opacity:0;pointer-events:none";
  document.body.append(field);
  try {
    field.select();
    field.setSelectionRange(0, value.length);
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
}

/** Copies the supplied current value, independently of the containing form. */
export function CopyTextButton({ value, label = "Copy ID", ariaLabel = "Copy transaction ID", className, disabled, compact = false }: CopyTextButtonProps) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const attempt = useRef(0);
  // Adjust local feedback when the value changes; no stale "Copied" label survives an edit.
  if (feedback && feedback.value !== value) setFeedback(null);
  useEffect(() => () => { attempt.current += 1; }, [value]);
  const status = feedback?.value === value ? feedback.status : undefined;

  async function copy() {
    const request = ++attempt.current;
    try {
      await writeClipboard(value);
      if (request === attempt.current) setFeedback({ value, status: "copied" });
    } catch {
      if (request === attempt.current) setFeedback({ value, status: "failed" });
    }
  }

  return <CopyAction type="button" className={className} disabled={disabled || !value} onClick={copy}
    aria-label={ariaLabel} title={status === "failed" ? "Copy failed. Select and copy the transaction ID manually." : status === "copied" ? "Transaction ID copied" : ariaLabel}
    $compact={compact && status !== "failed"}
    {...(status === "failed" ? { $tone: "danger" as const } : {})} data-copy-text>
    {status === "copied" ? <CheckIcon /> : <CopyIcon />}
    <span role="status" aria-live="polite" aria-atomic="true">{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label}</span>
  </CopyAction>;
}

const CopyAction = styled(TextAction)<{ $compact: boolean }>`
  flex: none;
  justify-content: center;
  min-inline-size: 44px;
  min-block-size: 44px;
  padding-inline: 8px;
  border-radius: 0;
  ${({ $compact }) => $compact && css`padding-inline: 0; > span { ${visuallyHidden} }`}
  ${media.desktop} { min-block-size: 38px; }
`;
