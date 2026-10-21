import { readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";

/** Synthetic manual approval replies share the real response contract: access opens without delivery credentials. */
export async function paymentAction(request: Request) {
  const read = await readJsonBody(request);
  if ("refusal" in read) return read.refusal;
  const action = String(read.body.action);
  if (["trial", "manual", "approve"].includes(action)) return json({
    status: action === "approve" ? "approved" : "granted",
    ...(action === "approve" ? { reference: "P-TEST" } : {}),
    endsAt: "2026-11-01T18:00:00.000Z", devicesUnlocked: 1,
  }, 201);
  if (action === "search") return json({ codes: [] });
  return json({ status: "saved" });
}
