"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styled from "styled-components";
import { Muted, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { ActionButton, ButtonRow, FormStack, Hint } from "./admin-form";
import type { CodeAction } from "./code-tools";

/** The recovery password stays in memory only, and disappears on Done or leaving the account. */
export type Revealed = Readonly<{ password: string; accountId: string; phone: string | null; created: boolean; sessionsDeleted: number; expiresAt: string }>;

export function PasswordReset({ path, phone, action, reveal }: { path: string; phone?: string; action: CodeAction; reveal: (value: Revealed) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const form = event.currentTarget, confirmed = new FormData(form).get("confirmed") === "on";
    const reply = await action.send(path, { action: "temporary-password", ...(phone ? { phone } : {}), confirmed });
    if (reply.ok && reply.body.status === "reset" && typeof reply.body.temporaryPassword === "string" && typeof reply.body.accountId === "string") {
      form.reset();
      reveal({ password: reply.body.temporaryPassword, accountId: reply.body.accountId, phone: phone ?? null, created: reply.body.created === true,
        expiresAt: typeof reply.body.expiresAt === "string" ? reply.body.expiresAt : "", sessionsDeleted: typeof reply.body.sessionsDeleted === "number" ? reply.body.sessionsDeleted : 0 });
    }
  }
  return <form method="post" action={path} onSubmit={submit}><FormStack>
    <label><input type="checkbox" name="confirmed" required disabled={action.busy} /> I am on a call with the member and checked it is their number.</label>
    <ActionButton type="submit" $variant="primary" disabled={action.busy}>Set temporary password</ActionButton>
  </FormStack></form>;
}

export function TemporaryPassword({ value, done }: { value: Revealed; done: () => void }) {
  const [copied, setCopied] = useState(false), secret = useRef<HTMLParagraphElement>(null);
  useEffect(() => { secret.current?.focus(); }, []);
  return <Panel aria-label="Temporary password" data-subscriber-temporary-password><PanelHeader><h2>Temporary password{value.phone ? ` · +${formatPhone(value.phone)}` : ""}</h2></PanelHeader>
    <Secret ref={secret} tabIndex={-1} translate="no">{value.password}</Secret><ButtonRow><ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(value.password).then(() => setCopied(true), () => {}); }}>{copied ? "Copied" : "Copy"}</ActionButton><ActionButton type="button" onClick={done}>Done</ActionButton></ButtonRow>
    <Hint>Read it to the member on the phone. It works once and requires them to choose a new password before signing in.</Hint>
    {value.expiresAt && <p>Expires {formatPeriodEnd(new Date(value.expiresAt))} (15 minutes).</p>}
    <Muted>{value.sessionsDeleted} device{value.sessionsDeleted === 1 ? "" : "s"} signed out. It is shown only now; set a new one if it is lost.</Muted>
    {value.created && <p><a href={`/admin/subscribers?accountId=${value.accountId}`}>Open the new account</a></p>}
  </Panel>;
}
const Secret = styled.p`font-size: clamp(1.3rem, 5vw, 2rem); font-weight: 800; letter-spacing: 0.08em; overflow-wrap: anywhere;`;
