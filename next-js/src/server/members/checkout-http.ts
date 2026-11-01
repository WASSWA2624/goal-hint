import "server-only";
import { paymentRules } from "../../domain/payment.ts";
import { json, readLimitedBody, clientAddress } from "../http/private-http.ts";
import { imageInputFormat } from "../images/image-format.ts";
import { memberRoute, getMemberServices, type MemberServicesSource } from "./member-http.ts";

export function createCheckoutHandlers(services: MemberServicesSource = getMemberServices) {
  return {
    GET: memberRoute(async ({ services, member }) => {
      const value = await services.checkout?.read(member!);
      return value ? json(value) : json({ message: "Checkout is unavailable." }, 503);
    }, { services, access: "member" }),
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
          if ([...data.keys()].some(k => !["payload", "image"].includes(k)) || data.getAll("payload").length !== 1 || data.getAll("image").length > 1) throw new Error();
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
        case "quote": result = await services.checkout.quote(member!, body.selection); break;
        case "confirm": result = await services.checkout.confirm(member!, body.selection, String(body.requestKey ?? ""), String(body.quoteKey ?? ""), body.confirmed === true, body.proof, image); break;
        case "attach": result = await services.checkout.attach(member!, id, body.proof, image); break;
        case "cancel": result = await services.checkout.cancel(member!, id); break;
        case "withdraw": result = await services.checkout.withdraw(member!, id, String(body.claimId ?? "")); break;
        case "reconfirm": result = await services.checkout.reconfirm(member!, id, Number(body.walletUgx), Number(body.referralDays), Number(body.amountToSend), body.confirmed === true); break;
        default: return json({ message: "Unknown checkout action." }, 400);
      }
      return result.ok ? json(result.value) : json({ message: result.message, code: result.code }, 409);
    }, { services, access: "member" }),
  };
}
