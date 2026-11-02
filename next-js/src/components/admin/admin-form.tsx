"use client";

import { controlRow } from "@/components/ui/control-layout";

export { FloatingField as FieldBlock } from "@/components/ui/floating-field";

import styled, { css } from "styled-components";
import { ToolButton } from "@/components/analytics/dashboard/dashboard-styles";
import { authCopy } from "@/i18n/messages/auth";
import { media } from "@/styles/theme";
import { filledField } from "@/components/ui/filled-surfaces";

/**
 * Reusable owner form parts with shared floating labels, aligned control rows, and 16 px field text
 * so phones do not zoom on focus. Owner copy is English only.
 */
export const FormStack = styled.div`
  display: grid;
  gap: var(--gh-spacing-3_5);
  min-inline-size: 0;
`;
export const FieldRow = styled.div`
  display: grid;
  gap: var(--gh-spacing-3_5);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-48)), 1fr));

  ${controlRow}
`;
export const adminControl = css`
  inline-size: 100%;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-2) var(--gh-spacing-2_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  ${filledField}
  font-size: var(--gh-font-section);
  ${media.desktop} { min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1_5); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  &:disabled { cursor: not-allowed; opacity: var(--gh-opacity-60); }
`;
export const Hint = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: var(--gh-weight-body);
  overflow-wrap: anywhere;
`;
export const FieldError = styled.span`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
/** The main action takes `$variant="primary"`; without a variant it is the secondary, link-coloured button. */
export const ActionButton = styled(ToolButton)`
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-3_5);
  ${({ theme, $variant }) => !$variant && css`color: ${theme.color.link};`}
`;
export const DangerButton = styled(ActionButton)`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  background: ${({ theme }) => theme.color.outcome.incorrect.background};

`;
export const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gh-spacing-2);
  > * { flex: 1 1 auto; }
`;
/** A confirmation checkbox with its sentence: the whole row is the target (44 px on phones, 36 px from desktop up). */
export const CheckField = styled.label`
  display: flex;
  align-items: flex-start;
  gap: var(--gh-spacing-2_5);
  min-block-size: var(--form-control-height);
  padding-block: var(--gh-spacing-2_75);
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: var(--gh-weight-body);
  line-height: var(--gh-leading-normal);
  cursor: pointer;
  input { flex: none; inline-size: var(--gh-size-5); block-size: var(--gh-size-5); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; }
  ${media.desktop} { min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1_75); input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin-block-start: var(--gh-spacing-0_25); } }
`;
export const Badge = styled.span<{ $tone?: "good" | "muted" | "warning" }>`
  display: inline-block;
  padding: var(--gh-spacing-0_5) var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.small};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${({ theme, $tone = "muted" }) => {
    const tone = $tone === "good" ? theme.color.outcome.correct : $tone === "warning" ? theme.color.outcome.pending : theme.color.outcome.void;
    return css`color: ${tone.text}; background: ${tone.background};`;
  }}
`;
export const Requirements = styled.ul`
  display: grid;
  gap: var(--gh-spacing-1);
  margin: 0;
  padding-inline-start: var(--gh-spacing-5);
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
  if (reply.status === 401) return authCopy.ownerSessionEnded;
  return typeof reply.body.message === "string" ? reply.body.message : fallback;
}

/** Field errors a refused reply names, keyed by field. */
export function replyErrors(reply: AdminReply): Record<string, string> {
  const errors = reply.body.errors;
  return errors !== null && typeof errors === "object" ? Object.fromEntries(Object.entries(errors).filter(([, value]) => typeof value === "string")) : {};
}
