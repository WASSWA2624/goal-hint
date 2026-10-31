"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styled, { createGlobalStyle, ThemeProvider } from "styled-components";
import { GlobalStyle } from "@/styles/global-style";
import { useClientReady } from "@/components/ui/use-client-ready";
import { appPreviewScreen, desktopThemes, findDesktopTheme, previewHref, previewScreens, type PreviewScreen } from "./catalog";

const ReviewStyle = createGlobalStyle`
  html { scrollbar-gutter: stable; }
  [data-preview-canvas] { background: ${({ theme }) => theme.color.page}; }
  [data-preview-canvas] :where(section[id]) { scroll-margin-block-start: calc(var(--review-height, 0px) + ${({ theme }) => theme.header.desktopHeight} + ${({ theme }) => theme.space.lg}); }
  [data-preview-canvas] > div { min-block-size: calc(100dvh - var(--review-height, 0px)); }
  [data-preview-canvas] [data-app-header] { top: var(--review-height, 0px); }
  [data-preview-canvas] [data-account-workspace] aside, [data-preview-canvas] [data-admin-sidebar] {
    top: calc(var(--review-height, 0px) + ${({ theme }) => theme.header.desktopHeight});
    max-height: calc(100dvh - var(--review-height, 0px) - ${({ theme }) => theme.header.desktopHeight});
    min-height: calc(100dvh - var(--review-height, 0px) - ${({ theme }) => theme.header.desktopHeight});
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    [data-preview-canvas] *, [data-preview-canvas] *::before, [data-preview-canvas] *::after { transition: none !important; animation: none !important; }
  }
`;
const Studio = styled.header`
  position: sticky; inset-block-start: 0; z-index: 50; background: ${({ theme }) => theme.color.surface};
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  font-family: var(--font-manrope), "Segoe UI", sans-serif;
`;
const Intro = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 20px;
  padding: 16px 24px 12px;
  > div:first-child { display: grid; gap: 3px; }
  h1 { font-size: 18px; font-weight: 750; letter-spacing: -.4px; }
  p { font-size: 12px; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Eyebrow = styled.span`
  display: block; font-size: 10px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase;
  color: ${({ theme }) => theme.color.brand}; margin-block-end: 2px;
`;
const Details = styled.div`
  display: flex; align-items: center; gap: 16px; text-align: end;
  > div { display: grid; gap: 3px; } strong { font-size: 12px; } small { color: ${({ theme }) => theme.color.mutedText}; font-size: 11px; }
`;
const SaveButton = styled.button`
  display: inline-flex; align-items: center; gap: 8px; min-block-size: 34px; padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
  &[aria-pressed="true"] { background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.brand}; }
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; }
`;
const ThemeNav = styled.nav`
  display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; padding: 0 24px 12px;
  a { display: grid; gap: 6px; align-content: center; min-height: 54px; padding: 9px 10px;
    border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.control};
    text-decoration: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 11px; font-weight: 650; white-space: nowrap;
  }
  a[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; }
  a:hover { border-color: ${({ theme }) => theme.color.brand}; }
  a:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  @media (max-width: 1250px) { a { padding-inline: 7px; font-size: 10px; } }
  @media (max-width: 1023px) { grid-template-columns: repeat(5, minmax(130px, 1fr)); overflow-x: auto; }
`;
const Swatches = styled.span`
  display: flex; gap: 3px; align-items: center;
  i { display: block; width: 13px; height: 6px; border: 1px solid rgb(127 127 127 / 25%); }
  b { margin-inline-start: auto; font-size: 9px; font-weight: 500; }
`;
const ScreenNav = styled.nav`
  display: flex; align-items: stretch; gap: 2px; padding-inline: 16px; overflow-x: auto;
  background: ${({ theme }) => theme.color.surfaceMuted}; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  a { display: flex; align-items: center; min-height: 40px; padding: 0 10px;
    border-block-end: 2px solid transparent; text-decoration: none; white-space: nowrap;
    font-size: 11px; font-weight: 650; color: ${({ theme }) => theme.color.mutedText}; }
  a[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  a:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.brandSoft}; }
  a:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -4px; }
`;
const DesktopNotice = styled.p`
  display: none; padding: 12px 24px; background: ${({ theme }) => theme.color.brandSoft};
  color: ${({ theme }) => theme.color.brand}; font-size: 13px;
  @media (max-width: 1023px) { display: block; }
`;
const Toast = styled.output`
  position: fixed; inset: auto 24px 24px auto; z-index: 100; max-width: 30rem; padding: 12px 18px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  box-shadow: ${({ theme }) => theme.shadow.popover}; font-size: 13px;
`;

const shortlistKey = "goal-hint-desktop-theme-shortlist";
function readShortlist() { try { return localStorage.getItem(shortlistKey) ?? ""; } catch { return ""; } }
function subscribeShortlist(notify: () => void) {
  window.addEventListener("storage", notify); window.addEventListener(shortlistKey, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(shortlistKey, notify); };
}

export function DesktopReview({ themeId, screen, children }: { themeId: string; screen: PreviewScreen; children: ReactNode }) {
  const direction = findDesktopTheme(themeId)!, router = useRouter();
  const query = useSearchParams().toString(), ready = useClientReady();
  const bar = useRef<HTMLElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortlistIds = useSyncExternalStore(subscribeShortlist, readShortlist, () => "");
  const saved = shortlistIds.split(",").includes(themeId), [notice, setNotice] = useState("");
  const index = desktopThemes.findIndex(theme => theme.id === themeId);
  useEffect(() => {
    document.cookie = `goal-hint-desktop-preview-theme=${themeId}; Path=/; SameSite=Lax`;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) document.documentElement.style.setProperty("--review-height", `${entry.target.getBoundingClientRect().height}px`);
    });
    if (bar.current) observer.observe(bar.current);
    return () => { observer.disconnect(); if (timer.current) clearTimeout(timer.current); document.documentElement.style.removeProperty("--review-height"); };
  }, [themeId]);
  function notify(message: string) {
    setNotice(message); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 4000);
  }
  function shortlist() {
    const ids = new Set(shortlistIds.split(",").filter(Boolean));
    if (saved) ids.delete(themeId); else ids.add(themeId);
    try {
      localStorage.setItem(shortlistKey, [...ids].join(",")); window.dispatchEvent(new Event(shortlistKey));
      notify(saved ? `${direction.name} removed from your shortlist.` : `${direction.name} shortlisted for this review.`);
    } catch { notify("Your browser could not save the shortlist. You can still compare all themes."); }
  }
  return <ThemeProvider theme={direction.theme}><GlobalStyle /><ReviewStyle />
    <Studio ref={bar} data-theme-studio>
      <Intro><div><Eyebrow>Goal Hint / Desktop collection</Eyebrow><h1>{String(index + 1).padStart(2, "0")} — {direction.name}</h1><p>{direction.description}</p></div>
        <Details><div><strong>{direction.fontLabel}</strong><small>{direction.shape === "crisp" ? "Crisp edges · fine outlines" : "Subtle corners · soft outlines"} · {direction.mode}</small></div>
          <SaveButton type="button" aria-pressed={saved} onClick={shortlist}>{saved ? "★ Shortlisted" : "☆ Shortlist"}</SaveButton>
          <div><strong>12 screens / 10 themes</strong><small>Desktop review · sample content</small></div>
        </Details>
      </Intro>
      <ThemeNav aria-label="Desktop themes">{desktopThemes.map((theme, position) => <Link key={theme.id}
        href={previewHref(theme.id, screen, query)} prefetch={false} aria-current={theme.id === themeId ? "page" : undefined}>
        <Swatches>{[theme.palette.header, theme.palette.page, theme.palette.accent].map((color, swatch) => <i key={swatch} style={{ background: color }} />)}<b>{String(position + 1).padStart(2, "0")}</b></Swatches>
        <span>{theme.name}</span>
      </Link>)}</ThemeNav>
      <ScreenNav aria-label="Preview screens">{previewScreens.map(([id, label]) => <Link key={id} href={previewHref(themeId, id)}
        prefetch={false} aria-current={id === screen ? "page" : undefined}>{label}</Link>)}</ScreenNav>
    </Studio>
    <DesktopNotice>These themes are designed for desktop. Use a window at least 1024px wide to compare the approved desktop layouts.</DesktopNotice>
    <div data-preview-canvas data-preview-theme={themeId} data-preview-screen={screen} data-preview-ready={ready} onClickCapture={event => {
      if ((event.target as HTMLElement).closest("[data-theme-toggle]")) {
        event.preventDefault(); event.stopPropagation(); notify("Use the theme navigator above to compare all ten desktop directions."); return;
      }
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) return;
      const destination = url.origin === window.location.origin ? appPreviewScreen(url.pathname, url.searchParams) : null;
      event.preventDefault(); event.stopPropagation();
      if (destination) router.push(previewHref(themeId, destination, url.searchParams.toString()));
      else notify("This action is shown for design review. Use the screen navigation above to explore the previews.");
    }} onSubmitCapture={event => {
      const form = event.target as HTMLFormElement;
      if (form.method.toLowerCase() !== "get") {
        event.preventDefault(); event.stopPropagation(); notify("Sample preview: account changes and submissions are disabled.");
      }
    }}>{children}</div>
    {notice && <Toast role="status" aria-live="polite">{notice}</Toast>}
  </ThemeProvider>;
}
