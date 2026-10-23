"use client";

import { useEffect, useTransition, type ReactNode } from "react";
import styled from "styled-components";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation/navigation-link";
import { Notice, PageTitle } from "@/components/analytics/dashboard/dashboard-styles";
import { adminSections, type AdminSection } from "@/domain/admin-navigation";
import { media } from "@/styles/theme";
import { adminControl } from "./admin-form";

/** A background tab shows "(n) Payments · …" while payments wait; the page's own title stays after it, and returns at 0. */
function pendingTitle(title: string, count: number, payments: boolean) {
  const base = title.replace(payments ? /^(?:\(\d+\) )?Payments · /u : /^\(\d+\) Payments · /u, "");
  return `${count > 0 ? `(${count}) ` : ""}${count > 0 || payments ? "Payments · " : ""}${base}`;
}

/**
 * One compact page selector serves every owner section. Site navigation and account actions belong to the shared header.
 */
export function AdminWorkspace({ current, developmentCredentials, children, pendingCount }: {
  current: AdminSection; developmentCredentials: boolean; children: ReactNode; pendingCount?: number;
}) {
  const router = useRouter(), [navigating, startNavigation] = useTransition();
  useEffect(() => {
    const refreshCount = () => {
      void fetch("/api/admin/payments?count=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then((v: { pendingCount: number } | null) => {
        if (v) { document.title = pendingTitle(document.title, v.pendingCount, current === "payments"); if (current === "payments") router.refresh(); }
      }).catch(() => {});
    };
    if (pendingCount === undefined) refreshCount();
    else document.title = pendingTitle(document.title, pendingCount, current === "payments");
    const timer = setInterval(refreshCount, 60000);
    return () => clearInterval(timer);
  }, [current, pendingCount, router]);
  return (
    <Workspace data-analytics-ignore>
      <Switcher aria-label="Admin pages" aria-busy={navigating}>
        <label htmlFor="admin-page">Admin</label>
        <PageSelect id="admin-page" name="admin-page" value={current} disabled={navigating} onChange={(event) => {
          const section = adminSections.find(({ key }) => key === event.target.value);
          if (section && section.key !== current) startNavigation(() => router.push(section.href));
        }}>
          {adminSections.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </PageSelect>
      </Switcher>
      <noscript><Fallback aria-label="Admin pages">{adminSections.map(({ key, href, label }) =>
        <Link key={key} href={href} aria-current={key === current ? "page" : undefined}>{label}</Link>)}</Fallback></noscript>
      <Column $wide={current === "analytics"}>
        {developmentCredentials && <Notice $tone="warning">
          Development sign-in is active. Production refuses it: set GOAL_HINT_ANALYTICS_ADMIN_USERNAME, GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH and GOAL_HINT_ANALYTICS_SECRET before deploying.
        </Notice>}
        {children}
      </Column>
    </Workspace>
  );
}

const Workspace = styled.div`
  min-inline-size: 0;
`;
const Switcher = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
  padding: 8px ${({ theme }) => theme.layout.gutter};
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  label { font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const PageSelect = styled.select`
  ${adminControl}
  inline-size: min(15rem, 72%);
  border-radius: 0;
`;
const Column = styled.div<{ $wide: boolean }>`
  display: grid;
  gap: 16px;
  min-inline-size: 0;
  max-inline-size: ${({ $wide }) => $wide ? "100%" : "56rem"};
  margin-inline: auto;
  padding-block: 20px;
  > ${PageTitle} h1 { font-size: 1.375rem; }
  ${media.desktop} { gap: 20px; padding-block: 24px; }
`;
const Fallback = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-block: 12px;
`;
