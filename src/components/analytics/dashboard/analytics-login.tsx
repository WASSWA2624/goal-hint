"use client";

import styled from "styled-components";
import { BrandImage, Notice } from "./dashboard-styles";
import { TextInput } from "@/components/ui/controls";

export type LoginStatus = "invalid" | "locked" | "unavailable" | "signed-out" | null;
export type LoginProblem = "not-configured" | "insecure-default" | "missing-secret" | "storage" | null;

const problems: Record<Exclude<LoginProblem, null>, string> = {
  "not-configured": "Analytics sign-in is not configured. Set GOAL_HINT_ANALYTICS_ADMIN_USERNAME and GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH on the server.",
  "insecure-default": "Sign-in is disabled because the configured password is the development default. Generate a new hash with npm run analytics:hash-password.",
  "missing-secret": "Sign-in is disabled until GOAL_HINT_ANALYTICS_SECRET (32+ random characters) is configured on the server.",
  storage: "Analytics storage is unavailable, so sign-in is disabled. Check the database configuration.",
};

/**
 * A plain form POST for administrator phones and existing owner usernames. Both dashboards use the same authentication
 * policy and reusable inputs; each posts to its own fixed route and lands back on that dashboard.
 */
export function AnalyticsLogin({ status, problem, retryAfterSeconds, action = "/api/analytics/login", title = "Analytics sign-in" }: {
  status: LoginStatus; problem: LoginProblem; retryAfterSeconds: number | null; action?: string; title?: string;
}) {
  const message = problem ? problems[problem]
    : status === "invalid" ? "Incorrect phone number, username, or password."
    : status === "locked" ? `Too many failed attempts. Try again in ${Math.max(1, Math.ceil((retryAfterSeconds ?? 900) / 60))} minutes.`
    : status === "unavailable" ? "Sign-in is temporarily unavailable. Try again shortly."
    : null;
  return (
    <Page>
      <Panel aria-labelledby="login-title">
        <BrandImage src="/brand/goal-hint-logo-primary.svg" alt="Goal Hint" width={112} height={26} />
        <div>
          <h1 id="login-title">{title}</h1>
          <p>Sign in with your administrator phone number and password. Existing owner usernames are also accepted.</p>
        </div>
        {status === "signed-out" && !problem && <Notice role="status">You have signed out.</Notice>}
        {message && <Notice $tone={problem || status === "locked" ? "warning" : "error"} role="alert">{message}</Notice>}
        <Form method="post" action={action}>
          <TextInput label="Phone number or owner username" name="username" autoComplete="username" required maxLength={64} autoCapitalize="none" spellCheck={false} disabled={problem !== null} />
          <TextInput label="Password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={problem !== null} />
          <button type="submit" disabled={problem !== null}>Sign in</button>
        </Form>
        <small>
          Too many failed attempts temporarily pause sign-in. Please wait 15 minutes before trying again.
        </small>
      </Panel>
    </Page>
  );
}

const Page = styled.main`
  display: grid;
  place-items: center;
  min-block-size: 100dvh;
  padding: 16px;
  background: ${({ theme }) => theme.color.page};
`;
const Panel = styled.section`
  display: grid;
  gap: 16px;
  inline-size: min(100%, 24rem);
  padding: 24px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  h1 { font-size: 1.25rem; }
  p, small { color: ${({ theme }) => theme.color.mutedText}; }
  small { font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
const Form = styled.form`
  display: grid;
  gap: 12px;
  label { display: grid; gap: 4px; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  input {
    min-block-size: 44px;
    padding: 8px 10px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    background: ${({ theme }) => theme.color.surface};
    color: ${({ theme }) => theme.color.text};
  }
  input:focus-visible, button:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  button[type="submit"] {
    min-block-size: 44px;
    border: 0;
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    cursor: pointer;
  }
  button:disabled, input:disabled { cursor: not-allowed; opacity: 0.6; }
`;
