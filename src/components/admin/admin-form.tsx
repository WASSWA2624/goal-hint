"use client";

import styled, { css } from "styled-components";
import { ToolButton } from "@/components/analytics/dashboard/dashboard-styles";
import { media } from "@/styles/theme";

/**
 * Form parts for owner pages: one column on phones, 44 px targets (40 px from desktop up), bold 13 px labels, and 16 px text
 * in fields so phones do not zoom on focus. Owner copy is English only.
 */
export const FormStack = styled.div`
  display: grid;
  gap: 14px;
  min-inline-size: 0;
`;
export const FieldRow = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
`;
export const adminControl = css`
  inline-size: 100%;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  padding: 8px 10px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font-size: 1rem;
  ${media.desktop} { min-block-size: 40px; padding-block: 6px; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.border}; }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
`;
export const FieldBlock = styled.label`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  input, select, textarea { ${adminControl} }
  textarea { min-block-size: 5.5rem; resize: vertical; }
`;
export const Hint = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: normal;
  overflow-wrap: anywhere;
`;
export const FieldError = styled.span`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
/** The main action takes `$variant="primary"`; without a variant it is the secondary, link-coloured button. */
export const ActionButton = styled(ToolButton)`
  min-block-size: ${({ theme }) => theme.control.minHeight};
  padding-inline: 14px;
  ${({ theme, $variant }) => !$variant && css`color: ${theme.color.link};`}
  ${media.desktop} { min-block-size: 40px; }
`;
export const DangerButton = styled(ActionButton)`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  background: ${({ theme }) => theme.color.outcome.incorrect.background};
  border-color: ${({ theme }) => theme.color.outcome.incorrect.border};
`;
export const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > * { flex: 1 1 auto; }
`;
export const Badge = styled.span<{ $tone?: "good" | "muted" | "warning" }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.border.radius};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${({ theme, $tone = "muted" }) => {
    const tone = $tone === "good" ? theme.color.outcome.correct : $tone === "warning" ? theme.color.outcome.pending : theme.color.outcome.void;
    return css`color: ${tone.text}; background: ${tone.background};`;
  }}
`;
export const Requirements = styled.ul`
  display: grid;
  gap: 4px;
  margin: 0;
  padding-inline-start: 20px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;

export type AdminReply = Readonly<{ ok: boolean; status: number; body: Record<string, unknown> }>;

/** One same-origin JSON POST to an `/api/admin` route; an ended owner session reads as a message, never a crash. */
export async function postAdmin(path: string, body: unknown): Promise<AdminReply> {
  try {
    const response = await fetch(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body: parsed };
  } catch {
    return { ok: false, status: 0, body: { message: "The connection failed. Check the network and try again." } };
  }
}

/** The message a refused reply carries, with the sign-in hint when the owner session ended. */
export function replyMessage(reply: AdminReply, fallback: string): string {
  if (reply.status === 401) return "Your owner session has ended. Reload the page and sign in again; nothing was saved.";
  return typeof reply.body.message === "string" ? reply.body.message : fallback;
}

/** Field errors a refused reply names, keyed by field. */
export function replyErrors(reply: AdminReply): Record<string, string> {
  const errors = reply.body.errors;
  return errors !== null && typeof errors === "object" ? Object.fromEntries(Object.entries(errors).filter(([, value]) => typeof value === "string")) : {};
}
