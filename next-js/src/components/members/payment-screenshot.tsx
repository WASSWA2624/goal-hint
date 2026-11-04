"use client";
import { useEffect, useId, useRef, useState, type ClipboardEvent } from "react";
import { Button } from "@/components/ui/controls";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { ClipboardIcon, ImageIcon, TrashIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { CheckoutEvidenceCheck } from "@/domain/checkout";
import { inspectPaymentScreenshot, unreadableScreenshotMessage, type ScreenshotMetadata } from "@/domain/payment-screenshot";
import { CheckoutDialog, CheckoutEvidenceField, CheckoutScreenshot } from "./checkout-parts";
import { Preview } from "./subscribe-styles";
import { preparePaymentImage } from "./payment-image";
import { readScreenshotText } from "./payment-ocr";
import { sendCheckout } from "./checkout-client";
import { PaymentImagePreview } from "./payment-image-preview";

export async function screenshotDigest(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
type Candidate = { image: Blob; sourceSha256: string; imageSha256: string };
type Picked = { file: File; url: string };
type Dialog = { title: string; message: string; kind: "error" | "duplicate" | "replace" | "pick" | "reuse";
  candidate?: Candidate; text?: string; metadata?: ScreenshotMetadata; files?: Picked[] };

export function PaymentScreenshot({ image, metadata, provider, submissionId, disabled, requirementId, optional = false, onAccept, onRemove, onBusyChange, onPasteMessage }: {
  image: Blob | null; metadata?: ScreenshotMetadata | null; provider: "mtn" | "airtel";
  submissionId: string | null; disabled: boolean; requirementId: string; onAccept: (image: Blob, metadata: ScreenshotMetadata, text: string) => void;
  optional?: boolean;
  onRemove: () => void; onBusyChange: (busy: boolean) => void; onPasteMessage: () => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), abort = useRef<AbortController | null>(null), running = useRef(false);
  const [processing, setProcessing] = useState(false), [dialog, setDialog] = useState<Dialog | null>(null);
  const [cancellable, setCancellable] = useState(false);
  const [selected, setSelected] = useState<number | null>(null), urls = useRef<string[]>([]), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); urls.current.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  function close() { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; setDialog(null); setSelected(null); }
  function failure(message = unreadableScreenshotMessage) { setDialog({ kind: "error", title: "Check your screenshot", message }); }
  function duplicate() { setDialog({ kind: "duplicate", title: "Screenshot already added", message: "This screenshot is already attached to this transaction. No second copy has been added." }); }
  function accept(candidate: Candidate, meta: ScreenshotMetadata, text: string) { close(); onAccept(candidate.image, meta, text); }
  async function read(candidate: Candidate) {
    if (running.current || disabled) return;
    running.current = true; close(); onBusyChange(true); setProcessing(true);
    const controller = new AbortController(); abort.current = controller;
    setCancellable(true);
    let checking = false;
    try {
      const text = (await readScreenshotText(candidate.image, undefined, controller.signal)).slice(0, 12000);
      if (controller.signal.aborted || !mounted.current) return;
      const checked = inspectPaymentScreenshot(text);
      if (!checked.ok) { failure(checked.message); return; }
      checking = true;
      const result = await sendCheckout<CheckoutEvidenceCheck>({ action: "check-evidence", evidence: { provider, transactionId: checked.evidence.transactionId,
        submissionId, imageSha256: candidate.imageSha256 } });
      if (controller.signal.aborted || !mounted.current) return;
      const meta: ScreenshotMetadata = { version: 1, provider, sourceSha256: candidate.sourceSha256, imageSha256: candidate.imageSha256, transactionId: checked.evidence.transactionId! };
      if (result.reuse === "own") {
        setDialog({ kind: "duplicate", title: "Payment already reported", message: `This transaction is already linked to your request ${result.reference ?? ""}. Use that existing request; it cannot be paid into your account twice.` }); return;
      }
      if (result.reuse === "reported" || result.imageRepeated) {
        setDialog({ kind: "reuse", title: result.reuse === "reported" ? "Transaction already reported" : "Screenshot previously uploaded", candidate, text, metadata: meta,
          message: "This payment or screenshot has already been reported. It cannot be credited twice. Use another screenshot, or keep it for an ownership review if this is your payment. The admin must verify the incoming transfer." }); return;
      }
      accept(candidate, meta, text);
    } catch {
      if (!controller.signal.aborted && mounted.current) failure(checking
        ? "We couldn’t check this transaction right now. Check your connection and try again. Your current screenshot has not been replaced."
        : unreadableScreenshotMessage);
    } finally {
      running.current = false;
      abort.current = null;
      if (mounted.current) { setProcessing(false); setCancellable(false); onBusyChange(false); }
    }
  }
  async function prepare(file: File, recheck = false) {
    if (running.current || disabled) return;
    running.current = true; abort.current = null; onBusyChange(true); setProcessing(true);
    let candidate: Candidate | null = null;
    try {
      if (!file.size || file.size > 25_000_000 || !file.type.startsWith("image/")) { failure("Choose one image smaller than 25 MB. This file is not a supported payment screenshot."); return; }
      const sourceSha256 = await screenshotDigest(file);
      if (!recheck && image && sourceSha256 === metadata?.sourceSha256) { duplicate(); return; }
      const prepared = await preparePaymentImage(file), imageSha256 = await screenshotDigest(prepared);
      if (!mounted.current) return;
      if (!recheck && image && imageSha256 === (metadata?.imageSha256 ?? await screenshotDigest(image))) { duplicate(); return; }
      candidate = { image: prepared, sourceSha256, imageSha256 };
      if (image && !recheck) {
        setDialog({ kind: "replace", title: "Replace screenshot?", message: "Only one screenshot can be attached to this transaction. Your current screenshot stays until the replacement passes its checks.", candidate }); return;
      }
    } catch { if (mounted.current) failure("This image could not be opened as a payment screenshot. Choose a clear, complete screenshot or paste the transaction message."); }
    finally { running.current = false; if (mounted.current) { setProcessing(false); onBusyChange(false); } }
    if (candidate && mounted.current) await read(candidate);
  }
  async function choose(files: File[]) {
    if (disabled || running.current) return;
    close();
    if (files.length === 1) { await prepare(files[0]!); return; }
    if (!files.length) { failure("No image was found. Copy a screenshot or choose an image file."); return; }
    if (files.length > 8 || files.some(file => file.size > 25_000_000)) { failure("Choose one image smaller than 25 MB, or paste fewer images to select one."); return; }
    running.current = true; onBusyChange(true); setProcessing(true);
    try {
      const unique: File[] = [], hashes = new Set<string>();
      for (const file of files) { const hash = await screenshotDigest(file); if (!hashes.has(hash)) { unique.push(file); hashes.add(hash); } }
      if (!mounted.current) return;
      const picked = unique.map(file => { const url = URL.createObjectURL(file); urls.current.push(url); return { file, url }; });
      setDialog({ kind: "pick", title: "Choose one screenshot", message: `One screenshot is allowed per transaction.${unique.length < files.length ? " Repeated copies were removed." : ""} Select the image you want to use.`, files: picked });
    } catch { if (mounted.current) failure("These images could not be read. Choose one clear screenshot and try again."); }
    finally { running.current = false; if (mounted.current) { onBusyChange(false); setProcessing(false); } }
  }
  async function paste() {
    try {
      const items = await navigator.clipboard.read(), files: File[] = [];
      for (const item of items) {
        const type = item.types.find(type => type.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], "Pasted screenshot", { type }));
      }
      await choose(files);
    } catch { failure("Your browser couldn’t read an image from the clipboard. Paste a copied screenshot into the screenshot box, or choose an image file."); }
  }
  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = [...event.clipboardData?.items ?? []].filter(item => item.kind === "file" && item.type.startsWith("image/")).flatMap(item => item.getAsFile() ?? []);
    event.preventDefault(); void choose(files);
  }
  const busy = disabled || processing;
  const ready = !!image && metadata?.version === 1;
  return <CheckoutEvidenceField aria-busy={processing}>
    <header><label htmlFor={`${id}-file`}>Payment screenshot{optional ? " (optional)" : ""}</label></header>
    <VisuallyHidden as="input" ref={input} id={`${id}-file`} type="file" accept="image/*" disabled={busy}
      onChange={event => { const files = [...event.currentTarget.files ?? []]; event.currentTarget.value = ""; void choose(files); }} />
    <CheckoutScreenshot role="group" tabIndex={0} aria-label={`Choose or paste a payment screenshot${optional ? " (optional)" : ""}`} aria-describedby={requirementId} onPaste={onPaste}>
      <div><Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}><ImageIcon />Choose image</Button>
        <Button variant="quiet" disabled={busy} onClick={() => void paste()}><ClipboardIcon />Paste image</Button></div>
      {image && <div data-screenshot-preview><PaymentImagePreview image={image} disabled={busy} />
        <Button variant="quiet" disabled={busy} onClick={onRemove}><TrashIcon />Remove screenshot</Button></div>}
      {image && !ready && !processing && <Button variant="secondary" disabled={disabled} onClick={() => void prepare(new File([image], "Saved screenshot", { type: image.type }), true)}>Recheck saved screenshot</Button>}
      {cancellable && <Button variant="quiet" onClick={() => abort.current?.abort()}>Cancel reading</Button>}
    </CheckoutScreenshot>
    {dialog && <CheckoutDialog id={`${id}-dialog`} title={dialog.title} open onCancel={close} closeLabel="Close screenshot message"
      footer={dialog.kind === "replace" ? <><CriteriaDialogButton variant="secondary" onClick={close}>Keep current</CriteriaDialogButton>
        <CriteriaDialogButton onClick={() => { const candidate = dialog.candidate!; close(); void read(candidate); }}>Replace screenshot</CriteriaDialogButton></>
        : dialog.kind === "pick" ? <><CriteriaDialogButton variant="secondary" onClick={close}>Cancel</CriteriaDialogButton>
          <CriteriaDialogButton disabled={selected === null} onClick={() => { const file = dialog.files![selected!]!.file; close(); void prepare(file); }}>Use selected screenshot</CriteriaDialogButton></>
        : dialog.kind === "reuse" ? <><CriteriaDialogButton variant="secondary" onClick={() => { close(); input.current?.click(); }}>Try another screenshot</CriteriaDialogButton>
          <CriteriaDialogButton onClick={() => accept(dialog.candidate!, dialog.metadata!, dialog.text!)}>Keep for review</CriteriaDialogButton></>
        : dialog.kind === "error" ? <><CriteriaDialogButton variant="secondary" onClick={() => { close(); requestAnimationFrame(onPasteMessage); }}>Use transaction message</CriteriaDialogButton>
          <CriteriaDialogButton onClick={() => { close(); input.current?.click(); }}>Try another screenshot</CriteriaDialogButton></>
        : <CriteriaDialogButton onClick={close}>OK</CriteriaDialogButton>}>
      <p>{dialog.message}</p>
      {dialog.kind === "pick" && dialog.files?.map((picked, index) => <label key={picked.url} style={{ display: "flex", alignItems: "center", gap: "var(--gh-spacing-2)", marginBlock: "var(--gh-spacing-2)" }}>
        <input type="radio" name={`${id}-choice`} checked={selected === index} onChange={() => setSelected(index)} />
        <Preview src={picked.url} alt={`Screenshot ${index + 1}`} style={{ maxWidth: "var(--gh-size-20)", maxHeight: "var(--gh-size-20)" }} />Screenshot {index + 1}
      </label>)}
    </CheckoutDialog>}
  </CheckoutEvidenceField>;
}
