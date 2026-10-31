"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState } from "react";
import { ShareIcon } from "@/components/ui/icons";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { createMessages } from "@/i18n/messages";
import { ShareTrigger } from "./sharing/slip-share-styles";

const SlipShareDrawer = dynamic(() => import("./sharing/slip-share-drawer").then((module) => module.SlipShareDrawer));

export function SlipShareAction({ source, sharedSlip, locale }: { source?: ShareSlipSource; sharedSlip?: SharedSlip; locale: string }) {
  const [open, setOpen] = useState(false), [cached, setCached] = useState(sharedSlip);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId(), m = createMessages(locale);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return <>
    <ShareTrigger ref={trigger} type="button" variant="quiet" data-share-slip aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={(event) => { event.stopPropagation(); setOpen(true); }}><ShareIcon />{m.text("slipShare.share")}</ShareTrigger>
    {open && <SlipShareDrawer id={id} {...(source ? { source } : {})} {...(cached ? { initialShared: cached } : {})}
      locale={locale} onPrepared={setCached} onClose={close} />}
  </>;
}
