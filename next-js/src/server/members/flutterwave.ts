import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { checkoutRules } from "../../domain/checkout.ts";
import { getRuntimePolicy, type RuntimePolicy } from "../config/runtime-policy.ts";

const api = "https://api.flutterwave.com/v3";
const checkoutOrigins = new Set(["https://checkout.flutterwave.com", "https://checkout-v2.dev-flutterwave.com"]);
const timeoutMs = 8_000;
export const stagingFlutterwaveWebhook = "https://test.goalhint.com/api/payments/flutterwave/webhook";
export const flutterwaveReturnPath = "/api/payments/flutterwave/return";
export const flutterwaveCurrency = "UGX";
export const flutterwaveSessionMinutes = 30;
export const flutterwaveReference = z.uuidv4();

export const flutterwaveTransactionId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,39}$/u)]).transform(String);
const verifiedResponse = z.object({
  status: z.literal("success"),
  data: z.object({
    id: flutterwaveTransactionId,
    tx_ref: flutterwaveReference,
    amount: z.number().int().positive().max(checkoutRules.maximumUgx),
    currency: z.string(),
    status: z.string(),
    created_at: z.iso.datetime({ offset: true }),
  }),
});
const checkoutResponse = z.object({ status: z.literal("success"), data: z.object({ link: z.string() }) });
export const flutterwaveEvent = z.object({
  event: z.literal("charge.completed"),
  data: z.object({ id: flutterwaveTransactionId, tx_ref: flutterwaveReference }),
});

export type VerifiedFlutterwavePayment = Readonly<{
  id: string; txRef: string; amountUgx: number; currency: string; status: string; paidAt: Date;
}>;

export type FlutterwaveConfig = Readonly<{ key: string; webhookSecret: string; origin: string | null; webhookUrl?: string }>;

/** Sandbox keys are accepted only on explicit staging or a nonproduction local runtime. */
export function getFlutterwaveConfig(policy: RuntimePolicy = getRuntimePolicy()): FlutterwaveConfig | null {
  const key = policy.secrets.flutterwaveKey?.read(), webhookSecret = policy.secrets.flutterwaveWebhookSecret?.read();
  const webhookUrl = policy.choices.flutterwaveWebhookUrl ?? stagingFlutterwaveWebhook;
  if (!key?.startsWith("FLWSECK_TEST-") || !webhookSecret || policy.deployment === "production" ||
      policy.mode === "production" && policy.deployment !== "staging" || webhookUrl !== stagingFlutterwaveWebhook) return null;
  return { key, webhookSecret, webhookUrl, origin: policy.deployment === "staging" ? new URL(webhookUrl).origin : null };
}

export function flutterwaveCheckoutUrl(value: string): string | null {
  try {
    const link = new URL(value);
    return checkoutOrigins.has(link.origin) && !link.username && !link.password &&
      /^\/v3\/hosted\/pay\/[a-z0-9-]+$/iu.test(link.pathname) && !link.search && !link.hash && link.href.length <= 255 ? link.href : null;
  } catch { return null; }
}

export function flutterwaveOrigin(config: FlutterwaveConfig, requestUrl: string): string | null {
  if (config.origin) return config.origin;
  const url = new URL(requestUrl);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol) ? url.origin : null;
}

/** Flutterwave Standard v3 sends the configured secret in verif-hash. */
export function validFlutterwaveWebhook(headers: Headers, secret: string): boolean {
  const signature = headers.get("verif-hash");
  return signature !== null && timingSafeEqual(createHash("sha256").update(signature).digest(), createHash("sha256").update(secret).digest());
}

export class FlutterwaveUnavailable extends Error {
  readonly retryable: boolean;

  constructor(retryable: boolean) {
    super("Flutterwave checkout is temporarily unavailable.");
    this.retryable = retryable;
  }
}

export function createFlutterwave(config: FlutterwaveConfig, send: typeof fetch = fetch) {
  async function request(path: string, body?: object): Promise<unknown> {
    const response = await send(`${api}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${config.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => { throw new FlutterwaveUnavailable(true); });
    if (!response.ok) throw new FlutterwaveUnavailable(response.status === 408 || response.status === 409 ||
      response.status === 429 || response.status >= 500);
    return response.json().catch(() => { throw new FlutterwaveUnavailable(true); });
  }

  return {
    config,
    async start(input: { id: string; amountUgx: number; payerPhone: string; email: string; origin: string;
      resumePlan?: boolean }): Promise<string> {
      const redirect = new URL(flutterwaveReturnPath, input.origin);
      if (input.resumePlan) redirect.searchParams.set("resume", "plan");
      const payload = await request("/payments", {
        tx_ref: input.id,
        amount: input.amountUgx,
        currency: flutterwaveCurrency,
        redirect_url: redirect.href,
        customer: { email: input.email, phonenumber: `+${input.payerPhone}` },
        customizations: { title: "Goal Hint" },
        configurations: { session_duration: flutterwaveSessionMinutes },
      });
      const parsed = checkoutResponse.safeParse(payload);
      const link = parsed.success ? flutterwaveCheckoutUrl(parsed.data.data.link) : null;
      if (!link) throw new FlutterwaveUnavailable(true);
      return link;
    },
    async verify(id: string): Promise<VerifiedFlutterwavePayment> {
      if (!flutterwaveTransactionId.safeParse(id).success) throw new FlutterwaveUnavailable(false);
      const parsed = verifiedResponse.safeParse(await request(`/transactions/${id}/verify`));
      if (!parsed.success || parsed.data.data.id !== id) throw new FlutterwaveUnavailable(true);
      const data = parsed.data.data;
      return { id, txRef: data.tx_ref, amountUgx: data.amount, currency: data.currency, status: data.status, paidAt: new Date(data.created_at) };
    },
  };
}

export type Flutterwave = ReturnType<typeof createFlutterwave>;
