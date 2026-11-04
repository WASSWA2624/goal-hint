"use client";

import { useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { focusTreatment } from "@/components/ui/controls";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { CheckoutDialog } from "./checkout-parts";

/** One private object URL serves the thumbnail and its in-page preview. */
export function PaymentImagePreview({ image, disabled = false }: { image: Blob; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(image);
    Promise.resolve().then(() => setUrl(next));
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return url ? <PaymentScreenshotPreview url={url} disabled={disabled} /> : null;
}

export function PaymentScreenshotPreview({ url, disabled = false, label = "Preview payment screenshot" }: { url: string; disabled?: boolean; label?: string }) {
  const id = useId(), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <>
    <Thumbnail ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
      <FullImage src={url} alt="Payment screenshot thumbnail" loading="lazy" />
    </Thumbnail>
    {open && <PreviewDialog id={`${id}-preview`} title="Payment screenshot" open closeLabel="Close screenshot preview" onCancel={close}
      footer={<CriteriaDialogButton onClick={close}>Close preview</CriteriaDialogButton>}>
      <FullImage src={url} alt="Payment screenshot" />
    </PreviewDialog>}
  </>;
}

const Thumbnail = styled.button`
  && {
    display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; min-inline-size: var(--gh-size-11); min-block-size: var(--gh-size-11);
    max-inline-size: 100%; padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none}; background: transparent; cursor: zoom-in;
  }
  && > img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: var(--gh-size-24); object-fit: contain; }
  &:disabled { cursor: wait; }
  ${focusTreatment}
`;
const PreviewDialog = styled(CheckoutDialog)`
  && { inline-size: min(var(--gh-size-208), calc(100vw - var(--gh-size-6))); }
`;
const FullImage = styled.img`
  && { display: block; inline-size: auto; block-size: auto; max-inline-size: 100%; max-block-size: calc(100dvh - var(--gh-size-42_5)); margin-inline: auto; object-fit: contain; }
`;
