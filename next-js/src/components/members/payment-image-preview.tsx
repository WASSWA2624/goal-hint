"use client";

import { useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { focusTreatment } from "@/components/ui/controls";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { CheckoutDialog } from "./checkout-parts";

/** One private object URL serves the thumbnail and its in-page preview. */
export function PaymentImagePreview({ image, disabled = false }: { image: Blob; disabled?: boolean }) {
  const id = useId(), [url, setUrl] = useState(""), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(image);
    Promise.resolve().then(() => setUrl(next));
    return () => URL.revokeObjectURL(next);
  }, [image]);
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }
  if (!url) return null;
  return <>
    <Thumbnail ref={trigger} type="button" aria-label="Preview payment screenshot" aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
      <FullImage src={url} alt="Payment screenshot thumbnail" />
    </Thumbnail>
    {open && <PreviewDialog id={`${id}-preview`} title="Payment screenshot" open closeLabel="Close screenshot preview" onCancel={close}
      footer={<CriteriaDialogButton onClick={close}>Close preview</CriteriaDialogButton>}>
      <FullImage src={url} alt="Payment screenshot" />
    </PreviewDialog>}
  </>;
}

const Thumbnail = styled.button`
  && {
    display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; min-inline-size: 44px; min-block-size: 44px;
    max-inline-size: 100%; padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none}; background: transparent; cursor: zoom-in;
  }
  && > img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: 96px; object-fit: contain; }
  &:disabled { cursor: wait; }
  ${focusTreatment}
`;
const PreviewDialog = styled(CheckoutDialog)`
  && { inline-size: min(52rem, calc(100vw - 24px)); }
`;
const FullImage = styled.img`
  && { display: block; inline-size: auto; block-size: auto; max-inline-size: 100%; max-block-size: calc(100dvh - 170px); margin-inline: auto; object-fit: contain; }
`;
