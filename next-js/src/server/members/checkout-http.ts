import "server-only";
import { paymentRules } from "../../domain/payment.ts";
import { json, readLimitedBody, clientAddress } from "../http/private-http.ts";
import { imageInputFormat } from "../images/image-format.ts";
import { flutterwaveOrigin, FlutterwaveUnavailable } from "./flutterwave.ts";
import { memberRoute, getMemberServices, type MemberContext, type MemberServicesSource } from "./member-http.ts";
import { checkoutEmail, checkoutSelectionSchema } from "../../domain/checkout.ts";

async function startFlutterwave({ request, services, member }: MemberContext,
  body: Record<string, unknown>, image: Buffer | null): Promise<Response> {
  const { checkout, flutterwave } = services;
  if (!checkout || !flutterwave || !member) return json({ message: "Flutterwave checkout is unavailable." }, 409);
  const origin = flutterwaveOrigin(flutterwave.config, request.url);
  const email = checkoutEmail.safeParse(body.email);
  if (!origin || !email.success || body.proof !== undefined || image) return json({ message: "Enter a valid email for Flutterwave checkout." }, 400);
  const started = await checkout.startFlutterwave(member, body.selection, String(body.requestKey ?? ""), String(body.quoteKey ?? ""), body.confirmed === true);
  if (!started.ok) return json({ message: started.message, code: started.code }, 409);
  const { id, amountUgx, payerPhone, lease, checkoutUrl, status } = started.value;
  if (!lease) return json({ id, status, checkoutUrl });

  try {
    const link = await flutterwave.start({ id, amountUgx, payerPhone, email: email.data, origin, resumePlan: body.resumePlan === true });
    const saved = await checkout.saveFlutterwaveUrl(id, lease, link);
    return saved.ok ? json({ id, status, checkoutUrl: saved.value }) : json({ message: saved.message }, 503);
  } catch (error) {
    if (error instanceof FlutterwaveUnavailable && !error.retryable) await checkout.releaseFlutterwaveLink(id, lease);
    return json({ message: "Flutterwave checkout is temporarily unavailable. Your selection is saved." }, 503);
  }
}

export function createCheckoutHandlers(services: MemberServicesSource = getMemberServices) {
  return {
    GET: memberRoute(async ({ services, member }) => {
      const value = await services.checkout?.read(member!);
      return value ? json(value) : json({ message: "Checkout is unavailable." }, 503);
    }, { services, access: "account" }),
    POST: memberRoute(async ({ request, services, member }) => {
      if (member!.blocked || !services.checkout || !services.payments) return json({ message: "Checkout is unavailable." }, 403);
      if (!await services.checkout.allow(member!, clientAddress(request.headers))) return json({ message: "Too many checkout attempts. Your draft is kept; try later." }, 429);
      const declared = Number(request.headers.get("content-length"));
      if (declared > paymentRules.bodyBytes) return json({ message: "Choose a smaller screenshot." }, 413);
      const raw = await readLimitedBody(request, paymentRules.bodyBytes, { deadlineMs: paymentRules.deadlineMs });
      if (!raw) return json({ message: "Payment evidence is too large." }, 413);
      let body: Record<string, unknown>, image: Buffer | null = null;
      try {
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const data = await new Response(raw, { headers: { "content-type": request.headers.get("content-type")! } }).formData();
          if (data.getAll("image").length > 1) return json({ message: "Use one screenshot per transaction. Choose one image and try again." }, 400);
          if ([...data.keys()].some(k => !["payload", "image"].includes(k)) || data.getAll("payload").length !== 1) throw new Error();
          body = JSON.parse(String(data.get("payload")));
          const file = data.get("image");
          if (file !== null) {
            if (!(file instanceof File) || file.size > paymentRules.imageBytes) throw new Error();
            image = Buffer.from(await file.arrayBuffer());
            if (!imageInputFormat(image, { formats: ["jpeg"], maxBytes: paymentRules.imageBytes, minSide: 200, maxSide: 4096, maxPixels: 12_000_000 })) throw new Error();
          }
        } else body = JSON.parse(new TextDecoder().decode(raw));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      } catch { return json({ message: "Check the payment details and screenshot." }, 400); }
      let result;
      const id = typeof body.id === "string" && /^[a-f0-9-]{36}$/iu.test(body.id) ? body.id : "";
      switch (body.action) {
        case "check-evidence": result = await services.checkout.checkEvidence(member!, body.evidence); break;
        case "quote": result = await services.checkout.quote(member!, body.selection); break;
        case "confirm": {
          const selection = checkoutSelectionSchema.safeParse(body.selection);
          if (selection.success && selection.data.method === "flw") return startFlutterwave({ request, services, member }, body, image);
          result = await services.checkout.confirm(member!, body.selection, String(body.requestKey ?? ""), String(body.quoteKey ?? ""), body.confirmed === true, body.proof, image);
          break;
        }
        case "attach": result = await services.checkout.attach(member!, id, body.proof, image); break;
        case "cancel": result = await services.checkout.cancel(member!, id); break;
        case "withdraw": result = await services.checkout.withdraw(member!, id, String(body.claimId ?? "")); break;
        case "reconfirm": result = await services.checkout.reconfirm(member!, id, Number(body.walletUgx), Number(body.referralDays), Number(body.amountToSend), body.confirmed === true); break;
        default: return json({ message: "Unknown checkout action." }, 400);
      }
      return result.ok ? json(result.value) : json({ message: result.message, code: result.code }, 409);
    }, { services, access: "account" }),
  };
}
