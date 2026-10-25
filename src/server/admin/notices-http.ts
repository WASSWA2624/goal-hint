import "server-only";
import { json } from "../http/private-http.ts";
import { createPaymentNoticeAdmin } from "./payment-notices.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { invalidAction, storageUnavailable, uuid } from "./codes-http.ts";

/**
 * Owner actions on the account-update SMS outbox: `resend` queues a failed or unconfirmed notice again (it answers the new
 * notification status), `dismiss` removes a closed one. A notice that can no longer change answers 409. The panel is
 * server-seeded, so there is no GET; nothing here returns a phone number or the message text.
 */
export function createNoticeHandlers({ now }: { now?: () => number } = {}) {
  return {
    async POST(context: AdminContext) {
      const { services, request, owner } = context;
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const b = read.body;
      if (!["resend", "dismiss"].includes(String(b.action)) || !uuid(b.id)) return invalidAction();
      const notices = createPaymentNoticeAdmin(services.database, now);
      try {
        const outcome = b.action === "resend" ? await notices.resend(b.id, owner.username) : await notices.dismiss(b.id, owner.username);
        return outcome.status === "saved" ? json(outcome) : json(outcome, 409);
      } catch { return storageUnavailable(); }
    },
  };
}
