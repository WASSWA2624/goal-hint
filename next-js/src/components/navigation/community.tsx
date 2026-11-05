"use client";

import { useId, useSyncExternalStore } from "react";
import styled from "styled-components";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { ChevronRightIcon, GroupIcon } from "@/components/ui/icons";
import { CommunityIcon } from "@/components/ui/community-icon";
import { communityDestinations, communityLinksSchema, type CommunityLink } from "@/domain/community";
import { startRequestDeadline } from "@/domain/request-deadline";

type CommunitySnapshot = Readonly<{ visible: boolean; links: readonly CommunityLink[] }>;
// Resolve public visibility before showing channels, including those awaiting a link.
const initial: CommunitySnapshot = { visible: false, links: [] };
let snapshot = initial, loading = false, refreshPending = false, checkedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
async function refresh(force = false) {
  if (loading) { refreshPending ||= force; return; }
  if (!force && Date.now() - checkedAt < 30_000) return;
  loading = true;
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch("/api/community", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("visible" in body) || typeof body.visible !== "boolean" || !("links" in body)) return;
    // The API already removed hidden destinations. Never fill them back in on the client.
    const parsed = communityLinksSchema.safeParse(body.links);
    if (!parsed.success) return;
    const next: CommunitySnapshot = { visible: body.visible, links: body.visible ? parsed.data.filter(link => link.enabled) : [] };
    checkedAt = Date.now();
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
      snapshot = next;
      for (const listener of listeners) listener();
    }
  } catch { /* Keep the last confirmed visibility during a temporary network failure. */ }
  finally {
    clearDeadline();
    loading = false;
    if (refreshPending) { refreshPending = false; void refresh(true); }
  }
}
const refreshOnFocus = () => { void refresh(); };
/** A completed settings save refreshes both navigation instances without waiting for polling. */
export function refreshCommunitySettings() { void refresh(true); }
function subscribe(listener: () => void) {
  listeners.add(listener); void refresh();
  if (listeners.size === 1) {
    window.addEventListener("focus", refreshOnFocus);
    timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener("focus", refreshOnFocus); clearInterval(timer); timer = undefined; }
  };
}
export function useCommunitySettings() { return useSyncExternalStore(subscribe, () => snapshot, () => initial); }

export function CommunityDialog({ open, links, onClose }: { open: boolean; links: readonly CommunityLink[]; onClose: () => void }) {
  const id = useId();
  if (!open) return null;
  return <CriteriaDialog id={id} open title={<CommunityHeading><GroupIcon />Join our community</CommunityHeading>} onCancel={onClose} closeLabel="Close community" footer={null} hideFooter>
    <Destinations data-community-destinations>
      {links.length === 0 && <p>No community links are available right now.</p>}
      {communityDestinations.map(destination => {
        const link = links.find(link => link.type === destination.type);
        if (!link) return null;
        const configured = link.url !== "";
        const content = <>
          <CommunityIcon type={link.type} />
          <span><strong>{destination.label}</strong><small>{configured ? destination.description : "Coming soon"}</small></span>
          {configured && <span data-community-action>{destination.action}<ChevronRightIcon /></span>}
        </>;
        return configured
          ? <a key={link.type} data-community-type={link.type} href={link.url} target="_blank" rel="noopener noreferrer">{content}</a>
          : <div key={link.type} data-community-type={link.type}>{content}</div>;
      })}
    </Destinations>
  </CriteriaDialog>;
}
const CommunityHeading = styled.span`
  display: inline-flex; align-items: center; gap: ${({ theme }) => theme.space.sm};
  > svg { flex: none; }
`;
const Destinations = styled.div`
  display: grid; min-inline-size: 0;
  > p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; }
  > [data-community-type] {
    display: flex; align-items: center; gap: ${({ theme }) => theme.space.sm}; min-block-size: var(--form-control-height);
    padding: ${({ theme }) => theme.space.sm}; color: ${({ theme }) => theme.color.text}; text-decoration: none;
    border-radius: ${({ theme }) => theme.radius.none};
    > svg { flex: none; font-size: var(--gh-font-section); }
    > span { min-inline-size: 0; overflow-wrap: anywhere; }
    strong, small { display: block; }
    small { color: ${({ theme }) => theme.color.mutedText}; }
    [data-community-action] {
      display: flex; align-items: center; gap: ${({ theme }) => theme.space.xs}; margin-inline-start: auto;
      color: ${({ theme }) => theme.color.link}; font-size: ${({ theme }) => theme.typography.scale.secondary};
      text-align: end; flex-shrink: 0;
      > svg { flex: none; }
    }
  }
  > a:hover { background: ${({ theme }) => theme.color.rowHover}; }
  > a:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.link}; outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth}); }
`;
