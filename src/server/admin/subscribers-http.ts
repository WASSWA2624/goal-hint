import "server-only";
import { normalizePhone } from "../../domain/phone.ts";
import { createAccessCodes } from "../members/access-codes.ts";
import { isMemberAdminPhone } from "../members/member-admin.ts";
import { json } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createSubscribers, type TemporaryPasswordOutcome } from "./subscribers.ts";
import { codeAnswer, invalidAction, storageUnavailable, uuid } from "./codes-http.ts";
/** The temporary password is in this one answer only (uncached, never logged or audited); the owner reads it out on the call. */
const passwordAnswer = (outcome: TemporaryPasswordOutcome) => outcome.status === "reset" ? json(outcome)
  : json(outcome, outcome.status === "refused" ? 409 : 400);
export function createSubscriberHandlers() {
  return {
    async POST(context: AdminContext) {
      const { services, owner, request } = context;
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const body = read.body, id = new URL(request.url).pathname.match(/\/subscribers\/([^/]+)$/u)?.[1];
      const service = createSubscribers(services.database);
      try {
        if (id === undefined) {
          // An allow-listed administrator number without an account: the owner's temporary password creates it.
          if (body.action === "temporary-password") return body.confirmed === true && typeof body.phone === "string" && body.phone.length <= 40
            ? passwordAnswer(await service.temporaryPassword({ phone: body.phone }, owner.username)) : invalidAction();
          if (typeof body.search !== "string" || body.search.length > 40) return invalidAction();
          const accounts = await service.search(body.search), phone = body.search ? normalizePhone(body.search) : null;
          return json({ accounts, ...(accounts.length === 0 && phone && isMemberAdminPhone(phone) ? { adminPhone: phone } : {}) });
        }
        if (!uuid(id)) return invalidAction();
        if (body.action === "change-number") {
          if (body.confirmed !== true || typeof body.newPhone !== "string" || !["old-number", "payment-details"].includes(String(body.verifiedBy))) return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).changeNumber(id, { newPhone: body.newPhone, verifiedBy: body.verifiedBy as "old-number" | "payment-details" }, owner.username));
        }
        if (body.action === "temporary-password") return body.confirmed === true ? passwordAnswer(await service.temporaryPassword({ id }, owner.username)) : invalidAction();
        if (body.action === "erase" && body.confirmed !== true || typeof body.action !== "string") return invalidAction();
        return codeAnswer(await service.action(id, body.action, body.value, owner.username));
      } catch { return storageUnavailable(); }
    },
  };
}
