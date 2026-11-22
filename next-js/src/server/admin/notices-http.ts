import "server-only";
import { json } from "../http/private-http.ts";
import { createPaymentNoticeAdmin } from "./payment-notices.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { invalidAction, storageUnavailable, uuid } from "./codes-http.ts";

/** Owner dismissals for historical member notices. Responses omit recipient details. */
export function createNoticeHandlers({ now }: { now?: () => number } = {}) {
  return {
    async POST(context: AdminContext) {
      const { services, request, owner } = context;
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const b = read.body;
      if (!["resend", "dismiss"].includes(String(b.action)) || !uuid(b.id)) return invalidAction();
      if (b.action === "resend") return json({ status: "refused", message: "Member account updates are available in the app." }, 409);
      const notices = createPaymentNoticeAdmin(services.database, now);
      try {
        const outcome = await notices.dismiss(b.id, owner.username);
        return outcome.status === "saved" ? json(outcome) : json(outcome, 409);
      } catch { return storageUnavailable(); }
    },
  };
}
