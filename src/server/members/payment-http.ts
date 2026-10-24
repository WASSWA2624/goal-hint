import "server-only";

import { parsePaymentFields, paymentFields, paymentRules } from "../../domain/payment.ts";
import { clientAddress, json, readLimitedBody } from "../http/private-http.ts";
import { imageInputFormat } from "../images/image-format.ts";
import { getMemberServices, memberRefusal, memberRoute, type MemberServicesSource } from "./member-http.ts";
import { duplicatePaymentMessage } from "./payments.ts";

const processState = globalThis as typeof globalThis & { goalHintPaymentUploads?: number };
const busy = (status = 429) => json({ error: "busy", message: "Busy, try again later. Call admin for help." }, status, { "Retry-After": "60" });
const invalid = () => json({ error: "invalid", message: "Check the transaction ID and Paid from number." }, 400);
const invalidImage = () => json({ error: "invalid", message: "Choose a valid payment screenshot, or submit without one." }, 400);

export function createPaymentHandler(services: MemberServicesSource = getMemberServices, { deadlineMs = paymentRules.deadlineMs }: { deadlineMs?: number } = {}) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (member!.blocked) return json({ error: "forbidden", message: memberRefusal }, 403);
    if (!resolved.payments) return busy(503);
    const length = request.headers.get("content-length");
    if (!length || !/^\d+$/u.test(length)) return json({ error: "length-required", message: "Payment could not be sent. Please try again." }, 411);
    const bytes = Number(length);
    if (bytes <= 0 || bytes > paymentRules.bodyBytes) return json({ error: "too-large", message: "Choose a smaller screenshot." }, 413);
    if ((processState.goalHintPaymentUploads ?? 0) >= 2) return busy(503);
    processState.goalHintPaymentUploads = (processState.goalHintPaymentUploads ?? 0) + 1;
    try {
      if (!await resolved.payments.begin(member!, clientAddress(request.headers), bytes)) return busy();
      let raw;
      try { raw = await readLimitedBody(request, bytes, { deadlineMs }); }
      catch { return json({ error: "timeout", message: "Sending took too long. Your details are kept; try again." }, 408); }
      if (!raw) return json({ error: "too-large", message: "Choose a smaller screenshot." }, 413);
      if (raw.byteLength !== bytes || !/^multipart\/form-data;\s*boundary=/iu.test(request.headers.get("content-type") ?? "")) return invalid();
      let data;
      try { data = await new Response(raw, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
      catch { return invalid(); }
      // Every payment field is required exactly once; only the screenshot may be left out.
      const expected: readonly string[] = [...paymentFields, "image"];
      if ([...data.keys()].some((key) => !expected.includes(key))
        || expected.some((key) => data.getAll(key).length !== 1 && !(key === "image" && data.getAll(key).length === 0))) return invalid();
      const image = data.get("image"), fields = parsePaymentFields(Object.fromEntries(paymentFields.flatMap((key) => data.has(key) ? [[key, data.get(key)] as const] : [])));
      if (!fields) return invalid();
      if (image !== null && (!(image instanceof File) || image.size > paymentRules.imageBytes)) return invalidImage();
      const buffer = image instanceof File ? Buffer.from(await image.arrayBuffer()) : null;
      if (buffer && !imageInputFormat(buffer, { formats: ["jpeg"], maxBytes: paymentRules.imageBytes, minSide: 200, maxSide: 4096, maxPixels: 12_000_000 })) return invalidImage();
      const result = await resolved.payments.submit(member!, fields, buffer);
      if (result.status === "busy") return busy();
      if (result.status === "duplicate") return json({ error: "duplicate", message: duplicatePaymentMessage }, 409);
      if (result.status === "refused") return json({ error: "forbidden", message: memberRefusal }, 403);
      return result.status === "saved" ? json(result, 201) : invalid();
    } finally { processState.goalHintPaymentUploads!--; }
  }, { services, access: "member" });
}

export function createTrialHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (member!.blocked) return json({ error: "forbidden", message: memberRefusal }, 403);
    if (!resolved.payments) return busy(503);
    const result = await resolved.payments.trial(member!, clientAddress(request.headers));
    return result === "saved" ? json({ status: "saved" }) : result === "busy" ? busy() : json({ error: "forbidden", message: memberRefusal }, 403);
  }, { services, access: "member" });
}
