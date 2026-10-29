"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { CopyIcon, KeyIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { ActionButton, CheckField } from "./admin-form";
import type { CodeAction } from "./code-tools";
import { MetaLine, monoFont, Panel, PanelBody, PanelHead } from "./desk-styles";

/** The recovery password stays in memory only, and disappears on Done or leaving the account. */
export type Revealed = Readonly<{ password: string; accountId: string; phone: string | null; created: boolean; sessionsDeleted: number; expiresAt: string }>;

export function PasswordReset({ path, phone, action, reveal, formId, externalActions = false, isActive }: { path: string; phone?: string; action: CodeAction; reveal: (value: Revealed) => void; formId?: string; externalActions?: boolean; isActive?: () => boolean }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const form = event.currentTarget, confirmed = new FormData(form).get("confirmed") === "on";
    const reply = await action.send(path, { action: "temporary-password", ...(phone ? { phone } : {}), confirmed });
    if (isActive ? !isActive() : !mounted.current) return;
    if (reply.ok && reply.body.status === "reset" && typeof reply.body.temporaryPassword === "string" && typeof reply.body.accountId === "string") {
      form.reset();
      reveal({ password: reply.body.temporaryPassword, accountId: reply.body.accountId, phone: phone ?? null, created: reply.body.created === true,
        expiresAt: typeof reply.body.expiresAt === "string" ? reply.body.expiresAt : "", sessionsDeleted: typeof reply.body.sessionsDeleted === "number" ? reply.body.sessionsDeleted : 0 });
    }
  }
  return <ResetForm id={formId} method="post" action={path} onSubmit={submit}>
    <CheckField><input type="checkbox" name="confirmed" required disabled={action.busy} />I am on a call with the member and checked it is their number.</CheckField>
    {!externalActions && <ActionButton type="submit" $variant="primary" disabled={action.busy}><KeyIcon />Set temporary password</ActionButton>}
  </ResetForm>;
}

/** Shown once after a reset: the password large enough to read aloud, then Done forgets it. */
export function TemporaryPassword({ value, done, externalActions = false }: { value: Revealed; done: () => void; externalActions?: boolean }) {
  const [copied, setCopied] = useState(false), secret = useRef<HTMLSpanElement>(null);
  useEffect(() => { secret.current?.focus(); }, []);
  return <RevealPanel aria-label="Temporary password" data-subscriber-temporary-password>
    <PanelHead><h2>Temporary password{value.phone ? ` · +${formatPhone(value.phone)}` : ""}</h2></PanelHead>
    <PanelBody>
      <SecretRow>
        <Secret ref={secret} tabIndex={-1} translate="no">{value.password}</Secret>
        <ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(value.password).then(() => setCopied(true), () => {}); }}><CopyIcon />{copied ? "Copied" : "Copy"}</ActionButton>
      </SecretRow>
      <Explain>Works once, then they choose a new password. Shown only now; if lost, set a new one.</Explain>
      <MetaLine>
        {value.expiresAt && <><span>Expires {formatPeriodEnd(new Date(value.expiresAt))}</span><span aria-hidden="true">·</span></>}
        <span>{value.sessionsDeleted} device{value.sessionsDeleted === 1 ? "" : "s"} signed out</span>
      </MetaLine>
      {value.created && <p><Link href={`/admin/subscribers?accountId=${value.accountId}`} prefetch={false}>Open the new account</Link></p>}
      {!externalActions && <DoneButton type="button" onClick={done}>Done</DoneButton>}
    </PanelBody>
  </RevealPanel>;
}

const ResetForm = styled.form`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  > button { inline-size: 100%; }
  ${media.desktop} { gap: 8px; > button { justify-self: start; inline-size: auto; } }
`;
const RevealPanel = styled(Panel)`
  border-color: ${({ theme }) => theme.color.outcome.correct.border};
  h2 { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
`;
const SecretRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 4px 14px;
  border-radius: ${({ theme }) => theme.border.radius};
  background: ${({ theme }) => theme.color.outcome.correct.background};
  > button { flex: none; }
  ${media.desktop} { padding: 6px 6px 6px 14px; }
`;
const Secret = styled.span`
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  font-family: ${monoFont};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: 0.14em;
  overflow-wrap: anywhere;
  &:focus { outline: none; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.desktop} { font-size: 1.625rem; }
`;
const Explain = styled.p`font-size: ${({ theme }) => theme.typography.scale.body};`;
const DoneButton = styled(ActionButton)`
  inline-size: 100%;
  ${media.desktop} { justify-self: start; inline-size: auto; }
`;
