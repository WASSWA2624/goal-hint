import "server-only";

import { z } from "zod";
import { memberNextPath } from "../../domain/member-navigation.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { BodyDeadlineError, empty, json, readLimitedBody, redirect } from "../http/private-http.ts";
import { flutterwaveReference, flutterwaveTransactionId } from "./flutterwave.ts";
import { privateTokenMatches, validFlutterwaveReturn } from "./flutterwave-navigation.ts";
import { getMemberServices, type MemberServicesSource } from "./member-http.ts";

const charge = z.object({ data: z.object({ id: flutterwaveTransactionId, tx_ref: flutterwaveReference }) });
const event = z.object({ event: z.string() });

export function createFlutterwaveWebhookHandler({
  services = getMemberServices, configuration = () => getRuntimePolicy().flutterwave,
}: {
  services?: MemberServicesSource;
  configuration?: () => { webhookSecret: { read(): string } | null; webhookUrl: { read(): string } | null };
} = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      const { webhookSecret, webhookUrl } = configuration();
      if (!webhookSecret || !webhookUrl) return empty(503);
      const signature = request.headers.get("verif-hash");
      if (!signature || signature.length > 4096 || !privateTokenMatches(signature, webhookSecret.read())) return empty(401);
      const incoming = new URL(request.url), expected = new URL(webhookUrl.read());
      if ((request.headers.get("host") ?? incoming.host) !== expected.host || incoming.pathname !== expected.pathname || incoming.search) return empty(403);
      const bytes = await readLimitedBody(request, 64 * 1024, { deadlineMs: 5_000 });
      if (!bytes) return empty(413);
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return empty(400); }
      const type = event.safeParse(payload);
      if (!type.success) return empty(400);
      if (type.data.event !== "charge.completed") return json({ received: true });
      const parsed = charge.safeParse(payload);
      if (!parsed.success) return empty(400);
      const checkout = (await services()).checkout;
      if (!checkout) return empty(503);
      await checkout.reconcileFlutterwave(parsed.data.data.tx_ref, parsed.data.data.id);
      return json({ received: true });
    } catch (error) {
      return empty(error instanceof BodyDeadlineError ? 408 : 503);
    }
  };
}

export function createFlutterwaveReturnHandler(services: MemberServicesSource = getMemberServices) {
  return async (request: Request, reference: string): Promise<Response> => {
    if (!flutterwaveReference.safeParse(reference).success) return empty(400);
    const query = new URL(request.url).searchParams;
    const txRef = query.get("tx_ref"), transaction = query.get("transaction_id");
    const returnTo = query.get("return"), state = query.get("state");
    if (txRef !== null && txRef !== reference || transaction !== null && !flutterwaveTransactionId.safeParse(transaction).success)
      return empty(400);
    let result: { requestId: string; status: string } | null = null;
    try {
      const { checkout, config } = await services();
      if (!validFlutterwaveReturn(reference, returnTo, state, config.key)) return empty(403);
      if (checkout) {
        try { result = await checkout.reconcileFlutterwave(reference, transaction ?? undefined); }
        catch { /* The status page can reconcile a transient provider failure. */ }
      }
    } catch { return empty(503); }
    const next = new URL(memberNextPath("subscribe", returnTo, undefined, !!returnTo), request.url);
    next.searchParams.set("payment", result?.requestId ?? reference);
    if (query.get("status") === "cancelled" && result?.status !== "approved") next.searchParams.set("paymentStatus", "cancelled");
    return redirect(`${next.pathname}${next.search}`);
  };
}
