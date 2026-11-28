"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import styled from "styled-components";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { Header, HeaderContent, ShellFrame } from "@/components/navigation/shell-styles";
import { HeaderBrand } from "@/components/ui/brand";
import { DocumentButtonLink } from "@/components/ui/controls";
import { AlertIcon, Icon } from "@/components/ui/icons";
import { MutedText, PageHeading, PageMain, Stack, Surface } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { media } from "@/styles/theme";

const Frame = styled(ShellFrame)`background: ${({ theme }) => theme.color.page};`;
const Main = styled(PageMain)`
  display: grid;
  place-items: start center;
  padding-block: clamp(var(--gh-spacing-6), 8dvh, var(--gh-spacing-16))
    max(var(--gh-spacing-6), env(safe-area-inset-bottom));
  padding-inline: max(var(--gh-spacing-2), env(safe-area-inset-left))
    max(var(--gh-spacing-2), env(safe-area-inset-right));

  ${media.desktop} {
    align-items: center;
    padding-block: var(--gh-spacing-8) max(var(--gh-spacing-8), env(safe-area-inset-bottom));
  }
`;
const Notice = styled(Surface)`
  display: grid;
  justify-items: start;
  gap: var(--gh-spacing-4);
  inline-size: min(100%, ${({ theme }) => theme.layout.formMaxWidth});
  padding: clamp(var(--gh-spacing-4), 5vw, var(--gh-spacing-8));
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  > svg { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-size-7); }
`;
const Description = styled(MutedText)`
  font-size: ${({ theme }) => theme.typography.scale.reading};
`;

const copy = {
  offline: { title: "You’re offline", description: "Check your Wi-Fi or mobile data connection, then try again." },
  unavailable: { title: "GoalHint is temporarily unavailable", description: "We couldn’t reach the service right now. Please try again shortly." },
  timeout: { title: "This page took too long to respond", description: "Try loading the page again." },
  runtime: { title: "This page couldn’t load", description: "Reload the page to try again, or return to Matches." },
  unknown: { title: "Couldn’t load this page", description: "Check your connection and try again. If the problem continues, please try again later." },
} as const;

function subscribeConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function readFailure(): keyof typeof copy {
  // The worker adds a cause only when it observed an HTTP failure or the header deadline.
  const reason = document.documentElement.dataset.goalhintOfflineReason;
  if (reason === "server-unavailable") return "unavailable";
  if (navigator.onLine === false) return "offline";
  return reason === "navigation-timeout" ? "timeout" : "unknown";
}

const unknownFailure = () => "unknown" as const;
const subscribeDocument = () => () => {};
const currentDocument = () => "";
const directOfflinePage = () => /^\/offline\/?$/u.test(location.pathname);
const retryDocument = () => directOfflinePage() ? "/en/matches" : location.href;

function canRecoverAutomatically() {
  const { pathname, searchParams } = new URL(location.href);
  return /^\/en\/(matches|best-slips|slips|performance)\/?$/u.test(pathname)
    && (!/^\/en\/slips\/?$/u.test(pathname) || !searchParams.has("build"));
}

/** This independently served document can be read and retried without a running application. */
export function OfflineView({ runtimeFailure = false }: { runtimeFailure?: boolean }) {
  const connectionFailure = useSyncExternalStore(subscribeConnection, readFailure, unknownFailure);
  const failure = runtimeFailure ? "runtime" : connectionFailure;
  const retryHref = useSyncExternalStore(subscribeDocument, retryDocument, currentDocument);
  const { title, description } = copy[failure];
  const [retrying, setRetrying] = useState(false);
  const retryPending = useRef(false);
  const autoRetried = useRef(false);

  const retry = useCallback(() => {
    if (retryPending.current) return;
    retryPending.current = true;
    // Commit the feedback while the current document still owns the screen.
    flushSync(() => setRetrying(true));
    if (directOfflinePage()) location.replace(retryDocument());
    else location.reload();
  }, []);

  useEffect(() => {
    let wasOffline = navigator.onLine === false;
    const onOffline = (event: Event) => { if (event.isTrusted && navigator.onLine === false) wasOffline = true; };
    const onOnline = (event: Event) => {
      if (!event.isTrusted || navigator.onLine !== true || !wasOffline) return;
      wasOffline = false;
      if (runtimeFailure || autoRetried.current || !canRecoverAutomatically()) return;
      autoRetried.current = true;
      retry();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      retryPending.current = false;
      setRetrying(false);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [retry, runtimeFailure]);

  function retryClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    retry();
  }

  return <Frame data-offline-view>
    <Header><HeaderContent $wide><HeaderBrand /></HeaderContent><NavigationProgress label="Loading" /></Header>
    <Main id="main-content">
      <Notice aria-labelledby="connection-heading">
        {failure === "offline" ? <Icon strokeWidth={1.5}><path d="M3 9a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15a4.5 4.5 0 0 1 6 0M12 19h.01M3 3l18 18" /></Icon>
          : <AlertIcon strokeWidth={1.5} />}
        <Stack $gap="sm">
          <PageHeading id="connection-heading">{title}</PageHeading>
          <Description>{description}</Description>
        </Stack>
        <DocumentButtonLink href={retryHref} aria-busy={retrying} aria-disabled={retrying} onClick={retryClick}>
          {retrying ? "Trying again…" : runtimeFailure ? "Reload" : "Try again"}
        </DocumentButtonLink>
        {runtimeFailure && <DocumentButtonLink href="/en/matches" variant="secondary">Matches</DocumentButtonLink>}
        <VisuallyHidden role="status">{retrying ? "Trying again." : ""}</VisuallyHidden>
      </Notice>
    </Main>
  </Frame>;
}
