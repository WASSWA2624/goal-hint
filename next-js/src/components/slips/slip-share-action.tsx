"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState } from "react";
import { ShareIcon } from "@/components/ui/icons";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { createMessages } from "@/i18n/messages";
import { ShareTrigger } from "./sharing/slip-share-styles";

const SlipShareDrawer = dynamic(() => import("./sharing/slip-share-drawer").then((module) => module.SlipShareDrawer));

export function SlipShareAction({ source, sharedSlip, locale, iconOnly = false }: { source?: ShareSlipSource; sharedSlip?: SharedSlip; locale: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false), [cached, setCached] = useState(sharedSlip);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId(), m = createMessages(locale);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return <>
    <ShareTrigger ref={trigger} type="button" variant="quiet" data-share-slip aria-haspopup="dialog" aria-expanded={open}
      data-share-icon-only={iconOnly ? "" : undefined} aria-label={iconOnly ? m.text("slipShare.share") : undefined} title={iconOnly ? m.text("slipShare.share") : undefined}
      aria-controls={open ? id : undefined} onClick={(event) => { event.stopPropagation(); setOpen(true); }}><ShareIcon />{!iconOnly && m.text("slipShare.share")}</ShareTrigger>
    {open && <SlipShareDrawer id={id} {...(source ? { source } : {})} {...(cached ? { initialShared: cached } : {})}
      locale={locale} onPrepared={setCached} onClose={close} />}
  </>;
}
