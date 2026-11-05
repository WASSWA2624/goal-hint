import { createHash } from "node:crypto";
import { checkEvidence, confirm, quote, rememberImage, settings, view } from "../../../fixture";
import { checkoutEvidenceWarnings } from "@/domain/checkout-evidence";
export const dynamic = "force-dynamic";
export function GET() { return Response.json(view()); }
export async function POST(request: Request) {
  const form = await request.formData(), body = JSON.parse(String(form.get("payload")));
  if (body.action === "check-evidence") return Response.json(checkEvidence(body.evidence));
  if (body.action === "quote") return Response.json(quote(body.selection));
  if (body.action === "confirm") {
    const image = form.get("image"), proof = body.proof;
    const warnings = proof ? checkoutEvidenceWarnings({ text: proof.original.text, screenshotText: typeof proof.original.extracted.screenshotText === "string" ? proof.original.extracted.screenshotText : "",
      messageSource: proof.original.extracted.messageSource, screenshotOcr: proof.original.extracted.screenshotOcr,
      hasImage: image instanceof File, transactionId: proof.transactionId, amountUgx: String(proof.amountUgx) }, body.selection.method,
    { mtn: settings.mtnNumber, airtel: settings.airtelNumber }) : [];
    if (warnings.length && !proof.warningsAccepted) return Response.json({ message: "Review the evidence warning before continuing." }, { status: 409 });
    const saved = confirm(body.selection, body.requestKey, proof);
    if (warnings.length) saved.reason = "Evidence differences submitted for admin review. No payment is verified in this preview.";
    if (image instanceof File) rememberImage(saved.id, createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex"));
    return Response.json(saved);
  }
  if (body.action === "cancel") { const r = view().requests.find(r => r.id === body.id); if (r) r.status = "cancelled"; return Response.json(r); }
  return Response.json({ message: "Synthetic fixture action unavailable" }, { status: 400 });
}
