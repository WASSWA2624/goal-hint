"use client";

import { useId, useSyncExternalStore } from "react";
import styled from "styled-components";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { ChevronRightIcon } from "@/components/ui/icons";
import { CommunityIcon } from "@/components/ui/community-icon";
import { communityDestinations, publicCommunityLinks, type CommunityLink } from "@/domain/community";

const empty: readonly CommunityLink[] = [];
let links = empty, loading = false, checkedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function refresh() {
  if (loading || Date.now() - checkedAt < 30_000) return;
  loading = true;
  void fetch("/api/community", { cache: "no-store" }).then(async response => {
    if (!response.ok) return;
    const body = await response.json(); links = publicCommunityLinks(body.links); checkedAt = Date.now();
    for (const listener of listeners) listener();
  }).catch(() => {}).finally(() => { loading = false; });
}
function subscribe(listener: () => void) {
  listeners.add(listener); refresh();
  if (listeners.size === 1) { window.addEventListener("focus", refresh); timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30_000); }
  return () => { listeners.delete(listener); if (!listeners.size) { window.removeEventListener("focus", refresh); clearInterval(timer); timer = undefined; } };
}
export function useCommunityLinks() { return useSyncExternalStore(subscribe, () => links, () => empty); }

export function CommunityDialog({ open, links, onClose }: { open: boolean; links: readonly CommunityLink[]; onClose: () => void }) {
  const id = useId();
  if (!open || links.length === 0) return null;
  return <CriteriaDialog id={id} open title="Join our community" onCancel={onClose} closeLabel="Close community" footer={null} hideFooter>
    <Destinations>{communityDestinations.map(destination => {
      const link = links.find(link => link.type === destination.type);
      return link && <a key={link.type} href={link.url} target="_blank" rel="noopener noreferrer"><CommunityIcon type={link.type} />
        <span><strong>{destination.label}</strong><small>{destination.description}</small></span><ChevronRightIcon /></a>;
    })}</Destinations>
  </CriteriaDialog>;
}
const Destinations = styled.div`
  display: grid; gap: ${({ theme }) => theme.space.sm}; min-inline-size: 0;
  a { display: flex; align-items: center; gap: ${({ theme }) => theme.space.sm}; min-block-size: var(--form-control-height);
    padding: ${({ theme }) => theme.space.sm}; color: ${({ theme }) => theme.color.text}; text-decoration: none;
    border-radius: ${({ theme }) => theme.radius.control};
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.link}; }
    > svg { flex: none; } > svg:last-child { margin-inline-start: auto; }
    span { min-inline-size: 0; overflow-wrap: anywhere; } strong, small { display: block; }
    small { color: ${({ theme }) => theme.color.mutedText}; }
  }
`;
