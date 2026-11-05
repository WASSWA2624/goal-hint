"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { appDownloadsHref, appReleaseKey, detectAppPlatform, nativeAppIdentity, shouldOfferAppDownload,
  type AppDownload, type AppDownloads, type AppPlatform, type AppPromptMemory, type NativeAppIdentity } from "@/domain/app-download-presentation";
import { createMessages } from "@/i18n/messages";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { Button, ButtonLink } from "@/components/ui/controls";
import { DownloadIcon } from "@/components/ui/icons";

const memoryKey = "goalhint:app-downloads";
const memoryEvent = "goalhint:app-download-memory";
const subscribeBrowser = () => () => {};
const browserAgent = () => navigator.userAgent;
function memorySnapshot() { try { return window.localStorage.getItem(memoryKey) ?? ""; } catch { return ""; } }
const serverMemory = () => "";
function subscribeMemory(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener(memoryEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(memoryEvent, listener); };
}
function readMemory(source: string): Record<string, AppPromptMemory> {
  try {
    const parsed: unknown = JSON.parse(source);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, AppPromptMemory> : {};
  } catch { return {}; }
}

type DownloadsContext = Readonly<{
  catalog: AppDownloads; platform: AppPlatform | null; native: NativeAppIdentity | null;
  acknowledge: (release: AppDownload) => void;
}>;
const Context = createContext<DownloadsContext | null>(null);
export function useAppDownloads() { return useContext(Context); }

/** One runtime for all headers: version-aware offers, bounded local memory and release refreshes. */
export function AppDownloadsProvider({ initial, initialAgent = "", locale, children }: { initial: AppDownloads; initialAgent?: string; locale: string; children: ReactNode }) {
  const [catalog, setCatalog] = useState(initial);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [sessionDismissed, setSessionDismissed] = useState<string | null>(null);
  const agent = useSyncExternalStore(subscribeBrowser, browserAgent, () => initialAgent);
  const saved = useSyncExternalStore(subscribeMemory, memorySnapshot, serverMemory);
  const pathname = usePathname();
  const native = nativeAppIdentity(agent), platform = native?.platform ?? detectAppPlatform(agent);
  const release = catalog.releases.find(candidate => candidate.platform === platform);
  const key = release ? appReleaseKey(catalog.channel, release) : null;
  const messages = createMessages(locale);

  useEffect(() => {
    const timer = window.setTimeout(() => { setNow(Date.now()); setReady(true); }, 2500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch("/api/downloads", { cache: "no-store", signal: controller.signal });
        if (response.ok) { setCatalog(await response.json() as AppDownloads); setNow(Date.now()); }
      } catch { /* A failed update check leaves the last usable catalog intact. */ }
      finally { pending = false; }
    }
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);

  const remember = useCallback((candidate: AppDownload, acknowledged: boolean) => {
    const releaseKey = appReleaseKey(catalog.channel, candidate);
    setSessionDismissed(releaseKey);
    try {
      const memory = readMemory(memorySnapshot());
      memory[`${catalog.channel}:${candidate.platform}`] = acknowledged ? { acknowledged: releaseKey } : { dismissed: releaseKey, dismissedAt: Date.now() };
      window.localStorage.setItem(memoryKey, JSON.stringify(memory));
      window.dispatchEvent(new Event(memoryEvent));
    } catch { /* In private/blocked storage, dismissal still lasts for this visit. */ }
  }, [catalog.channel]);
  const acknowledge = useCallback((candidate: AppDownload) => remember(candidate, true), [remember]);
  const stored = readMemory(saved)[`${catalog.channel}:${platform}`];
  const memory = stored && typeof stored === "object" ? stored : {};
  const update = !!native || !!memory.acknowledged;
  const excluded = /\/(?:download|account|subscribe|payments?)(?:\/|$)/.test(pathname ?? "");
  const show = !!(ready && release && !excluded && key !== sessionDismissed && shouldOfferAppDownload(catalog.channel, release, memory, now, native));

  return <Context.Provider value={{ catalog, platform, native, acknowledge }}>
    {children}
    {show && release && <CriteriaDialog id="app-download-invitation" title={messages.text(update ? "downloads.update" : "downloads.promptTitle")}
      open onCancel={() => remember(release, false)} closeLabel={messages.text("downloads.close")}
      footer={<>
        <Button type="button" variant="quiet" onClick={() => remember(release, false)}>{messages.text("downloads.later")}</Button>
        {!native && <Button type="button" variant="quiet" onClick={() => acknowledge(release)}>{messages.text("downloads.already")}</Button>}
        <ButtonLink href={appDownloadsHref(locale)} prefetch={false} onClick={() => remember(release, false)}><DownloadIcon />{messages.text(update ? "downloads.update" : "downloads.header")}</ButtonLink>
      </>}>
      <p>{messages.text(update ? "downloads.updateDescription" : "downloads.promptDescription")}</p>
      {release.version && <p>{messages.text("downloads.version", { version: release.version, build: String(release.build) })}</p>}
    </CriteriaDialog>}
  </Context.Provider>;
}
