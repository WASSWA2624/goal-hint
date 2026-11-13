import "server-only";

import { empty, readCookie, readLimitedBody, redirect } from "../http/private-http.ts";
import { getMemberServices, type MemberServicesSource } from "./member-http.ts";
import { memberCookieName } from "./member-sessions.ts";
import { flutterwaveCurrency, flutterwaveEvent, flutterwaveReference, flutterwaveTransactionId, validFlutterwaveWebhook } from "./flutterwave.ts";

export function createFlutterwaveHandlers(source: MemberServicesSource = getMemberServices) {
  return {
    async POST(request: Request): Promise<Response> {
      try {
        const { flutterwave, checkout } = await source();
        if (!flutterwave || !checkout) return empty(503);
        if (!validFlutterwaveWebhook(request.headers, flutterwave.config.webhookSecret)) return empty(401);
        let data: unknown;
        try {
          const raw = await readLimitedBody(request, 32_768, { deadlineMs: 3_000 });
          if (!raw) return empty(413);
          data = JSON.parse(new TextDecoder().decode(raw));
        } catch { return empty(400); }
        const event = flutterwaveEvent.safeParse(data);
        if (!event.success) return empty(200);
        const { id, tx_ref: reference } = event.data.data;
        const intent = await checkout.lookupFlutterwave(reference);
        if (!intent || intent.status === "approved" && intent.transactionId === id) return empty(200);
        const payment = await flutterwave.verify(id);
        if (payment.txRef !== reference || payment.currency !== flutterwaveCurrency ||
            payment.amountUgx !== intent.amountUgx) return empty(200);
        if (payment.status === "pending") return empty(503);
        if (payment.status !== "successful") return empty(200);
        const settled = await checkout.settleFlutterwave(payment);
        return empty(settled.ok ? 200 : 503);
      } catch { return empty(503); }
    },
    async GET(request: Request): Promise<Response> {
      const query = new URL(request.url).searchParams;
      const reference = flutterwaveReference.safeParse(query.get("tx_ref"));
      if (!reference.success) return redirect("/en/account?section=subscription");
      try {
        const { checkout, flutterwave, config, sessions } = await source();
        if (!checkout || !flutterwave || !sessions) return redirect("/en/account?section=subscription");
        const member = await sessions.verify(readCookie(request, memberCookieName(config.production)));
        const intent = member && !member.blocked && !member.administrator ? await checkout.lookupFlutterwave(reference.data) : null;
        if (!intent || intent.accountId !== member?.accountId) return redirect("/en/account?section=subscription");

        const result = new URLSearchParams();
        if (intent.purpose === "topup") {
          result.set("add", "credit");
          if (query.get("resume") === "plan") result.set("resume", "plan");
        }
        const finish = (status: "approved" | "pending" | "failed") => {
          result.set("flutterwave", status);
          return redirect(`/en/subscribe?${result}`);
        };
        const id = flutterwaveTransactionId.safeParse(query.get("transaction_id"));
        if (intent.status === "approved" && (!id.success || intent.transactionId === id.data)) return finish("approved");
        if (!id.success) return finish(query.get("status") === "failed" ? "failed" : "pending");
        try {
          const payment = await flutterwave.verify(id.data);
          if (payment.txRef !== reference.data || payment.currency !== flutterwaveCurrency ||
              payment.amountUgx !== intent.amountUgx) return finish("pending");
          if (payment.status === "failed" || payment.status === "cancelled") return finish("failed");
          if (payment.status !== "successful") return finish("pending");
          const settled = await checkout.settleFlutterwave(payment);
          return finish(settled.ok ? "approved" : "pending");
        } catch { return finish("pending"); }
      } catch { return redirect("/en/account?section=subscription"); }
    },
  };
}
