"use client";

import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/controls";
import { Main, Notice, Tab, Tabs } from "@/components/analytics/dashboard/dashboard-styles";

/** Owner dashboard sections share the same tab order on every admin page. */
const sections = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "payments", href: "/admin/payments", label: "Payments" },
  { key: "codes", href: "/admin/codes", label: "Codes" },
  { key: "subscribers", href: "/admin/subscribers", label: "Subscribers" },
  { key: "password-resets", href: "/admin/password-resets", label: "Password requests" },
  { key: "plans", href: "/admin/plans", label: "Plans" },
  { key: "settings", href: "/admin/settings", label: "Settings" },
  { key: "audit", href: "/admin/audit", label: "Audit" },
  { key: "analytics", href: "/analytics", label: "Analytics" },
] as const;
export type AdminSection = (typeof sections)[number]["key"];

/** A background tab shows "(n) Payments · …" while payments wait; the page's own title stays after it, and returns at 0. */
function pendingTitle(title: string, count: number, payments: boolean) {
  const base = title.replace(payments ? /^(?:\(\d+\) )?Payments · /u : /^\(\d+\) Payments · /u, "");
  return `${count > 0 ? `(${count}) ` : ""}${count > 0 || payments ? "Payments · " : ""}${base}`;
}

/**
 * Phone-first owner shell: one column, 44 px targets and a top tab strip. Signing out is a plain form POST, so it works
 * without JavaScript. Owner copy is English only.
 */
export function AdminWorkspace({ current, username, developmentCredentials, children, pendingCount }: {
  current: AdminSection; username: string; developmentCredentials: boolean; children: ReactNode; pendingCount?: number;
}) {
  const router = useRouter(), [count, setCount] = useState(pendingCount);
  useEffect(() => {
    const refreshCount = () => {
      void fetch("/api/admin/payments?count=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then((v: { pendingCount: number } | null) => {
        if (v) { setCount(v.pendingCount); document.title = pendingTitle(document.title, v.pendingCount, current === "payments"); if (current === "payments") router.refresh(); }
      }).catch(() => {});
    };
    if (pendingCount === undefined) refreshCount();
    const timer = setInterval(refreshCount, 60000);
    return () => clearInterval(timer);
  }, [current, pendingCount, router]);
  return (
    <Workspace data-analytics-ignore>
      <Actions>
        <strong>Admin</strong>
        <span>Signed in as <strong>{username}</strong></span>
        <form method="post" action="/api/admin/logout"><Button type="submit">Sign out</Button></form>
      </Actions>
      <Strip>
        <Tabs as="nav" aria-label="Owner dashboard">
          {sections.map((section) => (
            <SectionTab key={section.key} as="a" href={section.href} $selected={section.key === current}
              aria-current={section.key === current ? "page" : undefined}>{section.label}{section.key === "payments" && (pendingCount ?? count) !== undefined ? ` (${pendingCount ?? count})` : ""}</SectionTab>
          ))}
        </Tabs>
      </Strip>
      <Column as="div" $wide={current === "analytics"}>
        {developmentCredentials && <Notice $tone="warning">
          Development sign-in is active. Production refuses it: set GOAL_HINT_ANALYTICS_ADMIN_USERNAME, GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH and GOAL_HINT_ANALYTICS_SECRET before deploying.
        </Notice>}
        {children}
      </Column>
    </Workspace>
  );
}

const column = "48rem";

const Workspace = styled.div`
  min-inline-size: 0;
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-block-end: 16px;
  > span { margin-inline-start: auto; }
`;
const Strip = styled.div`
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${Tabs} {
    max-inline-size: ${({ theme }) => theme.layout.wideMaxWidth};
    margin-inline: auto;
    padding-inline: 16px;
    border-block-end: 0;
  }
`;
const SectionTab = styled(Tab)`
  display: inline-flex;
  align-items: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  text-decoration: none;
`;
const Column = styled(Main)<{ $wide: boolean }>`
  min-inline-size: 0;
  max-inline-size: ${({ $wide }) => $wide ? "100%" : column};
`;
