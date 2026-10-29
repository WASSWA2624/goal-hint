import "server-only";
import { normalizePhone } from "../../domain/phone.ts";
import { createAccessCodes } from "../members/access-codes.ts";
import { isMemberAdminPhone } from "../members/member-admin.ts";
import { json } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createSubscribers } from "./subscribers.ts";
import { parseSubscriberDirectoryQuery } from "../../domain/subscriber-directory.ts";
import { readSubscriberDirectory } from "./subscriber-directory.ts";
import { codeAnswer, invalidAction, storageUnavailable, uuid } from "./codes-http.ts";

const subscriberActions = new Set(["change-number", "credit-adjust", "note", "sign-out-all", "auto-renew-off", "block", "unblock", "erase", "delete"]);

export function createSubscriberHandlers() {
  return {
    async POST(context: AdminContext) {
      const { services, owner, request } = context;
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const body = read.body, id = new URL(request.url).pathname.match(/\/subscribers\/([^/]+)$/u)?.[1];
      if (id === undefined ? body.action !== undefined : !uuid(id) || typeof body.action !== "string" || !subscriberActions.has(body.action)) return invalidAction();
      if (!services.database) return storageUnavailable();
      const service = createSubscribers(services.database, Date.now, services.config);
      try {
        if (id === undefined) {
          const query = parseSubscriberDirectoryQuery(body);
          if (!query) return invalidAction();
          const accounts = await readSubscriberDirectory(services.database, query), phone = query.search ? normalizePhone(query.search) : null;
          return json({ accounts, ...(accounts.length === 0 && phone && isMemberAdminPhone(phone) ? { adminPhone: phone } : {}) });
        }
        if (body.action === "change-number") {
          if (body.confirmed !== true || typeof body.newPhone !== "string" || !["old-number", "payment-details"].includes(String(body.verifiedBy))) return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).changeNumber(id, { newPhone: body.newPhone, verifiedBy: body.verifiedBy as "old-number" | "payment-details" }, owner.username));
        }
        // A credit correction names its amount (negative takes credit away) and a reason the member's ledger keeps.
        if (body.action === "credit-adjust") {
          if (body.confirmed !== true || typeof body.amount !== "number" || typeof body.note !== "string") return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).adjustCredit(id, body.amount, body.note, owner.username));
        }
        if (typeof body.action !== "string" || ["erase", "delete"].includes(body.action) && body.confirmed !== true) return invalidAction();
        return codeAnswer(await service.action(id, body.action, body.value, owner.username));
      } catch { return storageUnavailable(); }
    },
  };
}
