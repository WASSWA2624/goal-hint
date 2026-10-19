import "server-only";
import { createAccessCodes } from "../members/access-codes.ts";
import { json } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createSubscribers } from "./subscribers.ts";
import { codeAnswer, invalidAction, storageUnavailable, uuid } from "./codes-http.ts";
export function createSubscriberHandlers() {
  return {
    async POST(context: AdminContext) {
      const { services, owner, request } = context;
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const body = read.body, id = new URL(request.url).pathname.match(/\/subscribers\/([^/]+)$/u)?.[1];
      const service = createSubscribers(services.database);
      try {
        if (id === undefined) return typeof body.search === "string" && body.search.length <= 40 ? json({ accounts: await service.search(body.search) }) : invalidAction();
        if (!uuid(id)) return invalidAction();
        if (body.action === "change-number") {
          if (body.confirmed !== true || typeof body.newPhone !== "string" || !["old-number", "payment-details"].includes(String(body.verifiedBy))) return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).changeNumber(id, { newPhone: body.newPhone, verifiedBy: body.verifiedBy as "old-number" | "payment-details" }, owner.username), context);
        }
        if (body.action === "erase" && body.confirmed !== true || typeof body.action !== "string") return invalidAction();
        return codeAnswer(await service.action(id, body.action, body.value, owner.username), context);
      } catch { return storageUnavailable(); }
    },
  };
}
