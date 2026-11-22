import "server-only";

import { z } from "zod";
import { validFlutterwaveCheckoutUrl, type FlutterwaveMode } from "../../domain/flutterwave-checkout.ts";
import { readLimitedBody } from "../http/private-http.ts";

export { flutterwaveCustomerEmail, validFlutterwaveCheckoutUrl } from "../../domain/flutterwave-checkout.ts";

const api = "https://api.flutterwave.com/v3/";
export const flutterwaveSessionMinutes = 30;
export const flutterwaveReference = z.uuid();
export const flutterwaveTransactionId = z.union([z.string(), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)])
  .transform(String).pipe(z.string().regex(/^[1-9]\d{0,19}$/u));

export type FlutterwaveTransaction = Readonly<{
  id: string; reference: string; status: string; amountUgx: number; currency: string; paidAt: Date | null;
}>;
export type FlutterwaveClient = Readonly<{
  create(input: { reference: string; amountUgx: number; email: string; phone: string; redirectUrl: string }): Promise<string>;
  verify(reference: string, transactionId?: string): Promise<FlutterwaveTransaction | null>;
}>;

const linkResponse = z.object({ status: z.literal("success"), data: z.object({ link: z.string() }) });
const verificationResponse = z.object({ status: z.literal("success"), data: z.object({
  id: flutterwaveTransactionId, tx_ref: z.string(), status: z.string(), amount: z.number().int().nonnegative(),
  currency: z.string(), created_at: z.iso.datetime({ offset: true }).optional(),
}) });

/** v3 Standard uses the API key's mode for both API requests. Provider errors remain private. */
export function createFlutterwaveClient(secretKey: string, mode: FlutterwaveMode, transport: typeof fetch = fetch): FlutterwaveClient {
  async function call(path: string, init?: RequestInit) {
    try {
      const response = await transport(new URL(path, api), {
        ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(9_000),
        headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json", ...init?.headers },
      });
      if (response.status === 404 && !init) return null;
      if (!response.ok) throw new Error();
      const body = await readLimitedBody(response, 64 * 1024, { deadlineMs: 9_000 });
      if (!body) throw new Error();
      return JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch { throw new Error("Flutterwave is temporarily unavailable."); }
  }

  return Object.freeze({
    async create({ reference, amountUgx, email, phone, redirectUrl }) {
      const response = linkResponse.safeParse(await call("payments", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          tx_ref: reference, amount: amountUgx, currency: "UGX", redirect_url: redirectUrl,
          payment_options: "mobilemoneyuganda", configuration: { session_duration: flutterwaveSessionMinutes },
          customer: { email, phone_number: `+${phone}` }, customizations: { title: "Goal Hint subscription" },
        }),
      }));
      if (!response.success || !validFlutterwaveCheckoutUrl(response.data.data.link, mode))
        throw new Error("Flutterwave checkout is temporarily unavailable.");
      return response.data.data.link;
    },
    async verify(reference, transactionId) {
      if (!flutterwaveReference.safeParse(reference).success || transactionId && !flutterwaveTransactionId.safeParse(transactionId).success) return null;
      const path = transactionId ? `transactions/${transactionId}/verify`
        : `transactions/verify_by_reference?${new URLSearchParams({ tx_ref: reference })}`;
      const body = await call(path);
      if (body === null) return null;
      const response = verificationResponse.safeParse(body);
      if (!response.success) throw new Error("Flutterwave verification is temporarily unavailable.");
      const data = response.data.data;
      return { id: data.id, reference: data.tx_ref, status: data.status, amountUgx: data.amount, currency: data.currency,
        paidAt: data.created_at ? new Date(data.created_at) : null };
    },
  });
}
