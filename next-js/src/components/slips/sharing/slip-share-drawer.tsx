"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, ShareIcon } from "@/components/ui/icons";
import { type NativeShareImage } from "@/components/members/invitation-share";
import { prepareNativeSlipImages, shareSlipImages } from "./slip-share-native";
import { publicPolicy } from "@/domain/public-policy";
import { type BuiltSlip } from "@/domain/slip-builder";
import { createLocalSlipShare, sharedSlipSchema, type SharedSlip, type ShareSlipSource, type SlipSharePresentation } from "@/domain/shared-slips";
import { slipNumberFingerprint, readableCodePattern } from "@/domain/readable-code";
import { slipShareCaption } from "@/domain/slip-share-caption";
import { createMessages, type TextKey } from "@/i18n/messages";
import { createSlipShareDownload, downloadSlipShare } from "./slip-share-download";
import { Drawer, DrawerBody, DrawerButton, DrawerFooter, DrawerHeader } from "./slip-share-styles";
import { SlipShareLogoError } from "./slip-share-assets";

type Prepared = { shared: SharedSlip; files: File[]; download: File; caption: string; imageUrls: string[]; nativeFiles: readonly NativeShareImage[] | null };

export function SlipShareDrawer({ id, source, initialShared, localSlip, createdAt, presentation, locale, onPrepared, onClose }: {
  id: string; source?: ShareSlipSource; initialShared?: SharedSlip; localSlip?: BuiltSlip; createdAt?: string; presentation?: SlipSharePresentation; locale: string;
  onPrepared: (shared: SharedSlip) => void; onClose: () => void;
}) {
  const m = createMessages(locale), dialog = useRef<HTMLDialogElement>(null), existing = useRef(initialShared);
  const local = useRef(source?.source === "builder" ? localSlip : undefined);
  const snapshot = useRef({ ...presentation, capturedAt: new Date().toISOString() });
  const sourceJson = source ? JSON.stringify(source) : undefined;
  const [attempt, setAttempt] = useState(0), [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<TextKey | null>(null), [feedback, setFeedback] = useState<TextKey | null>(null);
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let imageUrls: string[] = [];
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    async function prepare() {
      try {
        let shared = existing.current;
        if (!shared && local.current) {
          shared = createLocalSlipShare(local.current, createdAt);
          existing.current = shared;
        }
        if (!shared) {
          if (!sourceJson) throw new Error("missing-source");
          const response = await fetch("/api/slips/share", { method: "POST", headers: { "Content-Type": "application/json" },
            credentials: "same-origin", body: sourceJson, signal: controller.signal });
          if (!response.ok) {
            const key = response.status === 401 || response.status === 403 ? "slipShare.forbidden" : response.status === 409
              ? "slipShare.changed" : response.status === 429 ? "slipShare.limited" : "slipShare.error";
            if (active) setError(key);
            return;
          }
          shared = sharedSlipSchema.parse(await response.json());
          existing.current = shared;
        }
        if (!shared.number) {
          const response = await fetch("/api/slips/number", { method: "POST", credentials: "same-origin", signal: controller.signal,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(shared.url?.includes("/s/")
              ? { token: shared.id } : { fingerprint: await slipNumberFingerprint(shared.slip) }) });
          if (!response.ok) throw new Error("number-unavailable");
          const reference = await response.json() as { number: string; contacts?: string[] };
          if (!readableCodePattern.test(reference.number)) throw new Error("invalid-number");
          shared = { ...shared, number: reference.number, ...(reference.contacts ? { contacts: reference.contacts } : {}) };
        }
        shared = { ...shared, ...snapshot.current };
        existing.current = shared;
        if (active) onPrepared(shared);
        // Network requests have a deadline; a valid long slip may need longer to encode every image.
        window.clearTimeout(timeout);
        const { createSlipShareImages } = await import("./slip-share-image");
        const files = await createSlipShareImages(shared, locale, controller.signal);
        const caption = slipShareCaption(shared, locale);
        const download = await createSlipShareDownload(files, shared.number!, caption);
        const nativeFiles = await prepareNativeSlipImages(files).catch(() => null);
        if (active) {
          imageUrls = files.map((file) => URL.createObjectURL(file));
          setPrepared({ shared, files, download, caption, imageUrls, nativeFiles });
        }
      } catch (error) {
        if (active) setError(error instanceof SlipShareLogoError
          ? error.reason === "invalid" ? "slipShare.logosInvalid" : "slipShare.logosUnavailable" : "slipShare.error");
      }
      finally { window.clearTimeout(timeout); }
    }
    void prepare();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); imageUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [attempt, sourceJson, locale, createdAt, onPrepared]);

  async function saveImage() {
    if (!prepared || sharing) return;
    setSharing(true); setFeedback(null);
    try {
      if (window.goalHintNativeShare?.downloadFiles && prepared.nativeFiles) {
        const result = await window.goalHintNativeShare.downloadFiles({ title: publicPolicy.name, text: prepared.caption,
          url: prepared.shared.url ?? publicPolicy.origin, files: prepared.nativeFiles });
        if (result === "handed-off") setFeedback("slipShare.downloaded");
      } else if (window.goalHintNativeShare) setFeedback("slipShare.downloadUnavailable");
      else { downloadSlipShare(prepared.download); setFeedback(prepared.files.length > 1 ? "slipShare.savedArchive" : "slipShare.saved"); }
    } catch { setFeedback("slipShare.downloadUnavailable"); }
    finally { setSharing(false); }
  }

  async function share() {
    if (!prepared || sharing) return;
    setFeedback(null); setSharing(true);
    const link = { title: publicPolicy.name, text: prepared.caption, url: prepared.shared.url ?? publicPolicy.origin };
    try {
      const result = await shareSlipImages(link, prepared.files, prepared.nativeFiles);
      if (result === "handed-off") setFeedback("slipShare.handedOff");
      else if (result !== "cancelled") {
        setFeedback(result === "unsupported" ? "slipShare.imageFallback" : "slipShare.shareError");
      }
    } finally { setSharing(false); }
  }

  return <Drawer id={id} ref={dialog} aria-labelledby={`${id}-title`} data-slip-share-drawer
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <DrawerHeader><h2 id={`${id}-title`}>{m.text("slipShare.title")}</h2>
      <DrawerButton type="button" variant="quiet" aria-label={m.text("slipShare.close")} onClick={onClose}><CloseIcon /></DrawerButton></DrawerHeader>
    <DrawerBody aria-busy={sharing || !prepared && !error}>
      {error ? <div role="alert" data-share-error><p>{m.text(error)}</p><DrawerButton type="button" variant="secondary"
        onClick={() => { setError(null); setAttempt((current) => current + 1); }}>{m.text("slipShare.retry")}</DrawerButton></div>
        : prepared && <>
          <figure>{prepared.imageUrls[page] &&
            // Canvas PNGs are local Blob URLs; there is no remote image for Next to optimize.
            // eslint-disable-next-line @next/next/no-img-element
            <img data-share-image src={prepared.imageUrls[page]} width={1080}
              alt={m.text("slipShare.imageAlt", { page: m.number(page + 1), pages: m.number(prepared.files.length) })} />}
            {prepared.files.length > 1 && <figcaption data-image-pagination>
              <DrawerButton type="button" variant="quiet" aria-label={m.text("slipShare.previousImage")} disabled={page === 0} onClick={() => setPage((current) => current - 1)}><ChevronLeftIcon /></DrawerButton>
              <span>{m.text("slipShare.imagePage", { page: m.number(page + 1), pages: m.number(prepared.files.length) })}</span>
              <DrawerButton type="button" variant="quiet" aria-label={m.text("slipShare.nextImage")} disabled={page + 1 === prepared.files.length} onClick={() => setPage((current) => current + 1)}><ChevronRightIcon /></DrawerButton>
            </figcaption>}
          </figure>
          <p data-share-summary>{m.text("slipShare.summary", { selections: m.plural("slips.selections", prepared.shared.slip.selections.length), odds: prepared.shared.slip.totalOdds })}</p>
          {prepared.files.length > 1 && <p data-share-public-note>{m.text("slipShare.multipleImagesHint")}</p>}
          <div data-share-caption><p>{m.text("slipShare.captionTitle", { name: publicPolicy.name })}</p>
            {prepared.shared.url && <a href={prepared.shared.url} target="_blank" rel="noopener noreferrer">{prepared.shared.url.replace(/^https:\/\//u, "")}</a>}
            <a href={publicPolicy.origin} target="_blank" rel="noopener noreferrer">{new URL(publicPolicy.origin).host}</a></div>
          {prepared.shared.url && <p data-share-public-note>{m.text("slipShare.publicHint")}</p>}
        </>}
    </DrawerBody>
    <DrawerFooter>
      <div data-share-actions><DrawerButton type="button" variant="secondary" disabled={!prepared || sharing} onClick={() => { void saveImage(); }}><DownloadIcon />{m.text(prepared && prepared.files.length > 1 ? "slipShare.saveImages" : "slipShare.saveImage")}</DrawerButton>
        <DrawerButton type="button" disabled={!prepared || sharing} onClick={() => { void share(); }}><ShareIcon />{m.text("slipShare.share")}</DrawerButton></div>
      {feedback && <p data-share-feedback role="status">{m.text(feedback)}</p>}
    </DrawerFooter>
  </Drawer>;
}
