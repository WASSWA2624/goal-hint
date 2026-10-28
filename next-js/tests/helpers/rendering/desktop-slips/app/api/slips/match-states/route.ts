import { createSlipMatchStatesHandler } from "@/server/slips/slip-match-states";
import { autoControl, autoObservations } from "../../../auto-state";

const handler = createSlipMatchStatesHandler({
  access: async () => ({ tier: autoControl().mode === "forbidden" ? "free" : "full", signedIn: true, mode: "off" }),
  read: async (selections) => {
    const control = autoControl(), phase = control.phase, mode = control.mode;
    control.reads++;
    control.batches = [...control.batches.slice(-19), selections.length];
    if (mode === "unavailable") throw new Error("Illustrative temporary outage");
    if (control.delayMs) await new Promise((resolve) => setTimeout(resolve, control.delayMs));
    return { states: autoObservations(selections, phase), asOf: Date.now() };
  },
});

/** Real handler/validation with controlled sealed observations instead of accounts or storage. */
export async function POST(request: Request) {
  const control = autoControl();
  control.requests++; control.inFlight++;
  control.maxInFlight = Math.max(control.maxInFlight, control.inFlight);
  try { return await handler(request); } finally { control.inFlight = Math.max(0, control.inFlight - 1); }
}
