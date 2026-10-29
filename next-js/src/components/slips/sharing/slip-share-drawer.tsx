"use client";

import { useEffect, useRef, useState } from "react";
import { ChatIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, DownloadIcon } from "@/components/ui/icons";
import { publicPolicy } from "@/domain/public-policy";
import { sharedSlipSchema, type SharedSlip, type ShareSlipSource } from "@/domain/shared-slips";
import { slipShareCaption, whatsAppShareUrl } from "@/domain/slip-share-caption";
import { createMessages, type TextKey } from "@/i18n/messages";
import { createSlipShareDownload, downloadSlipShare } from "./slip-share-download";
import { Drawer, DrawerBody, DrawerButton, DrawerFooter, DrawerHeader } from "./slip-share-styles";

type Prepared = { shared: SharedSlip; files: File[]; download: File; caption: string; imageUrls: string[] };

export function SlipShareDrawer({ id, source, initialShared, locale, onPrepared, onClose }: {
  id: string; source?: ShareSlipSource; initialShared?: SharedSlip; locale: string;
  onPrepared: (shared: SharedSlip) => void; onClose: () => void;
}) {
  const m = createMessages(locale), dialog = useRef<HTMLDialogElement>(null), existing = useRef(initialShared);
  const sourceJson = source ? JSON.stringify(source) : undefined;
  const [attempt, setAttempt] = useState(0), [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<TextKey | null>(null), [feedback, setFeedback] = useState<TextKey | null>(null);
  const [page, setPage] = useState(0);
  const [manualCopy, setManualCopy] = useState(false), [sharing, setSharing] = useState(false), [webFallback, setWebFallback] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);
  const captionField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (manualCopy) captionField.current?.focus(); }, [manualCopy]);

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
          if (active) onPrepared(shared);
        }
        // Network requests have a deadline; a valid long slip may need longer to encode every image.
        window.clearTimeout(timeout);
        const { createSlipShareImages } = await import("./slip-share-image");
        const files = await createSlipShareImages(shared, locale, controller.signal, (done, total) => {
          if (active) setImageProgress({ done, total });
        });
        const caption = slipShareCaption(shared, locale);
        const download = await createSlipShareDownload(files, shared.id, caption);
        if (active) {
          imageUrls = files.map((file) => URL.createObjectURL(file));
          setPrepared({ shared, files, download, caption, imageUrls });
        }
      } catch { if (active) setError("slipShare.error"); }
      finally { window.clearTimeout(timeout); }
    }
    void prepare();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); imageUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [attempt, sourceJson, locale, onPrepared]);

  function saveImage() {
    if (!prepared) return;
    downloadSlipShare(prepared.download);
    setFeedback(prepared.files.length > 1 ? "slipShare.savedArchive" : "slipShare.saved");
  }

  async function copyCaption() {
    if (!prepared) return;
    try { await navigator.clipboard.writeText(prepared.caption); setFeedback("slipShare.copied"); }
    catch { setManualCopy(true); setFeedback("slipShare.copyManually"); }
  }

  function openWhatsApp() {
    if (!prepared) return;
    // Open within this click's activation; preparing files earlier avoids blocked popups.
    window.open(whatsAppShareUrl(prepared.caption), "_blank", "noopener,noreferrer");
    downloadSlipShare(prepared.download);
    setFeedback(prepared.files.length > 1 ? "slipShare.attachImages" : "slipShare.attachImage");
  }

  async function share() {
    if (!prepared || sharing) return;
    setFeedback(null); setWebFallback(false);
    const data: ShareData = { files: prepared.files, title: publicPolicy.name, text: prepared.caption };
    let native = false;
    try { native = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare(data); }
    catch { /* Unsupported browser capability data uses the desktop path. */ }
    if (!native) { openWhatsApp(); return; }
    setSharing(true);
    try { await navigator.share(data); setFeedback("slipShare.handedOff"); }
    catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) setFeedback("slipShare.shareError");
      setWebFallback(true);
    } finally { setSharing(false); }
  }

  return <Drawer id={id} ref={dialog} aria-labelledby={`${id}-title`} data-slip-share-drawer
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <DrawerHeader><h2 id={`${id}-title`}>{m.text("slipShare.title")}</h2>
      <DrawerButton type="button" variant="quiet" aria-label={m.text("slipShare.close")} onClick={onClose}><CloseIcon /></DrawerButton></DrawerHeader>
    <DrawerBody aria-busy={!prepared && !error}>
      {error ? <div role="alert" data-share-error><p>{m.text(error)}</p><DrawerButton type="button" variant="secondary"
        onClick={() => { setError(null); setImageProgress(null); setAttempt((current) => current + 1); }}>{m.text("slipShare.retry")}</DrawerButton></div>
        : !prepared ? <p role="status">{imageProgress && imageProgress.total > 1
          ? m.text("slipShare.preparingImages", { page: m.number(imageProgress.done), pages: m.number(imageProgress.total) })
          : m.text("slipShare.preparing")}</p> : <>
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
          <div data-share-caption><p>{m.text("slipShare.captionTitle", { name: publicPolicy.name })}</p>
            <a href={prepared.shared.url} target="_blank" rel="noopener noreferrer">{prepared.shared.url.replace(/^https:\/\//u, "")}</a>
            <a href={publicPolicy.origin} target="_blank" rel="noopener noreferrer">{new URL(publicPolicy.origin).host}</a></div>
          <p data-share-public-note>{m.text("slipShare.publicHint")}</p>
          {manualCopy && <label>{m.text("slipShare.caption")}<textarea ref={captionField} readOnly value={prepared.caption} onFocus={(event) => event.currentTarget.select()} /></label>}
        </>}
    </DrawerBody>
    <DrawerFooter>
      <div data-share-secondary><DrawerButton type="button" variant="quiet" disabled={!prepared} onClick={saveImage}><DownloadIcon />{m.text(prepared && prepared.files.length > 1 ? "slipShare.saveImages" : "slipShare.saveImage")}</DrawerButton>
        <DrawerButton type="button" variant="quiet" disabled={!prepared} onClick={() => { void copyCaption(); }}><CopyIcon />{m.text("slipShare.copyCaption")}</DrawerButton></div>
      <DrawerButton type="button" data-share-primary disabled={!prepared || sharing} onClick={() => { void share(); }}><ChatIcon />{m.text("slipShare.whatsApp")}</DrawerButton>
      {feedback && <p data-share-feedback role="status">{m.text(feedback)}</p>}
      {webFallback && <DrawerButton type="button" variant="quiet" onClick={openWhatsApp}>{m.text("slipShare.openWhatsApp")}</DrawerButton>}
    </DrawerFooter>
  </Drawer>;
}
