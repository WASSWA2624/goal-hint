"use client";

import styled from "styled-components";
import { BrandImage, Notice } from "./dashboard-styles";
import { ButtonLink } from "@/components/ui/controls";
import { SignInIcon } from "@/components/ui/icons";

export type LoginStatus = "invalid" | "locked" | "unavailable" | "signed-out" | null;
export type LoginProblem = "not-configured" | "insecure-default" | "missing-secret" | "storage" | null;

const problems: Record<Exclude<LoginProblem, null>, string> = {
  "not-configured": "Analytics sign-in is not configured. Set GOAL_HINT_ANALYTICS_ADMIN_USERNAME and GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH on the server.",
  "insecure-default": "Sign-in is disabled because the configured password is the development default. Generate a new hash with npm run analytics:hash-password.",
  "missing-secret": "Sign-in is disabled until GOAL_HINT_ANALYTICS_SECRET (32+ random characters) is configured on the server.",
  storage: "Analytics storage is unavailable, so sign-in is disabled. Check the database configuration.",
};

/**
 * A plain form POST: works without JavaScript and never embeds credentials in the page. `/analytics` and `/admin` share
 * the one owner login; each posts to its own fixed sign-in route, which lands back on that page.
 */
export function AnalyticsLogin({ status, problem, retryAfterSeconds, action = "/api/analytics/login", title = "Analytics sign-in" }: {
  status: LoginStatus; problem: LoginProblem; retryAfterSeconds: number | null; action?: string; title?: string;
}) {
  const message = problem ? problems[problem]
    : status === "invalid" ? "Incorrect username or password."
    : status === "locked" ? `Too many failed attempts. Try again in ${Math.max(1, Math.ceil((retryAfterSeconds ?? 900) / 60))} minutes.`
    : status === "unavailable" ? "Sign-in is temporarily unavailable. Try again shortly."
    : null;
  return (
    <Page>
      <Panel aria-labelledby="login-title">
        <BrandImage src="/brand/goal-hint-logo-primary.svg" alt="Goal Hint" width={112} height={26} />
        <div>
          <h1 id="login-title">{title}</h1>
          <p>Private dashboard for the Goal Hint operator.</p>
        </div>
        {status === "signed-out" && !problem && <Notice role="status">You have signed out.</Notice>}
        {message && <Notice $tone={problem || status === "locked" ? "warning" : "error"} role="alert">{message}</Notice>}
        <ButtonLink href="/en/account" prefetch={false}><SignInIcon />Sign in with your phone number</ButtonLink>
        <Form method="post" action={action}>
          <label>Username<input name="username" autoComplete="username" required maxLength={64} autoCapitalize="none" spellCheck={false} disabled={problem !== null} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={problem !== null} /></label>
          <button type="submit" disabled={problem !== null}>Sign in</button>
        </Form>
        <small>
          Five failed attempts from one network pause sign-in there for 15 minutes; 50 in an hour pause it everywhere.
          Sessions end after 2 idle hours or 12 hours in total.
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
  button {
    min-block-size: 44px;
    border: 0;
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    cursor: pointer;
  }
  button:disabled, input:disabled { cursor: not-allowed; opacity: 0.6; }
`;
