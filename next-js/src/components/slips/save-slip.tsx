"use client";

import { useState } from "react";
import { Button } from "@/components/ui/controls";
import { serializeSlipCriteria, type SlipCriteria } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import { Note } from "./slip-styles";

export function SaveSlip({ slipId, criteria, locale }: { slipId: string; criteria: SlipCriteria; locale: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle"), m = createMessages(locale);
  async function save() {
    setState("saving");
    try {
      const response = await fetch("/api/account/slips", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ slipId, criteria: serializeSlipCriteria(criteria).toString() }) });
      if (!response.ok) throw new Error("save-failed");
      setState("saved");
    } catch { setState("error"); }
  }
  return <div>
    <Button variant="secondary" type="button" onClick={save} disabled={state === "saving" || state === "saved"}>
      {m.text(state === "saved" ? "slips.saved" : state === "saving" ? "slips.saving" : "slips.save")}
    </Button>
    {state === "saved" && <Note role="status">{m.text("slips.savedHint")}</Note>}
    {state === "error" && <Note role="alert">{m.text("slips.saveError")}</Note>}
  </div>;
}
