"use client";

import { useId, useState } from "react";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { TextInput } from "@/components/ui/controls";
import { ShareIcon } from "@/components/ui/icons";
import { Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { ShareTrigger } from "./slip-share-styles";

/** Completed publications can be shared without creating a privileged share record. */
export function PublicSlipShare({ href, locale, iconOnly }: { href: string; locale: string; iconOnly: boolean }) {
  const [open, setOpen] = useState(false), [feedback, setFeedback] = useState("");
  const id = useId(), m = createMessages(locale);
  const url = typeof window === "undefined" ? href : new URL(href, window.location.origin).href;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setFeedback(m.text("slipShare.linkCopied")); }
    catch { setFeedback(m.text("slipShare.copyManually")); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: m.text("slipShare.sharedTitle"), url }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback(m.text("slipShare.linkFallback")); }
  }
  return <>
    <ShareTrigger type="button" variant="quiet" data-share-slip data-share-public aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-label={m.text("slipShare.share")} data-share-icon-only={iconOnly ? "" : undefined}
      onClick={(event) => { event.stopPropagation(); setOpen(true); }}><ShareIcon />{!iconOnly && m.text("slipShare.share")}</ShareTrigger>
    {open && <CriteriaDialog id={id} title={m.text("slipShare.title")} open onCancel={() => setOpen(false)} closeLabel={m.text("slipShare.close")}
      footer={<><CriteriaDialogButton type="button" variant="quiet" onClick={copy}>{m.text("slipShare.copyLink")}</CriteriaDialogButton>
        <CriteriaDialogButton type="button" onClick={share}>{m.text("slipShare.shareLink")}</CriteriaDialogButton></>}>
      <Stack $gap="sm"><TextInput label={m.text("slipShare.link")} value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
        <p role="status">{feedback}</p></Stack>
    </CriteriaDialog>}
  </>;
}
