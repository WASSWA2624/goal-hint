import "server-only";
import { z } from "zod";
import { createAccessCodes } from "../members/access-codes.ts";
import { createPasswordRecovery } from "../members/password-recovery.ts";
import { json } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createSubscribers } from "./subscribers.ts";
import { parseSubscriberDirectoryCursor, parseSubscriberDirectoryPage, parseSubscriberDirectoryQuery, subscriberDirectoryPageSize } from "../../domain/subscriber-directory.ts";
import { readSubscriberDirectory } from "./subscriber-directory.ts";
import { codeAnswer, invalidAction, readManualGrant, storageUnavailable, uuid } from "./codes-http.ts";
import { auditTextErrors } from "./audit.ts";
import { requireOwner } from "./owner-auth.ts";

const subscriberActions = new Set(["grant", "password-reset", "change-number", "credit-adjust", "note", "sign-out-selected", "sign-out-all", "auto-renew-off", "block", "unblock", "erase", "delete"]);
const subscriberId = (request: Request) => new URL(request.url).pathname.match(/\/subscribers\/([^/]+)$/u)?.[1];

export function createSubscriberHandlers() {
  return {
    async GET({ request, services }: AdminContext) {
      const id = subscriberId(request);
      if (!uuid(id)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        const detail = await createSubscribers(services.database).detail(id.toLowerCase());
        return detail ? json({ detail }) : json({ message: "This subscriber could not be found." }, 404);
      } catch { return storageUnavailable(); }
    },
    async POST(context: AdminContext) {
      const { services, owner, request } = context;
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const body = read.body, id = subscriberId(request);
      if (id === undefined ? body.action !== undefined : !uuid(id) || typeof body.action !== "string" || !subscriberActions.has(body.action)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        if (id === undefined) {
          const { page: requestedPage, after, ...filters } = body;
          const query = parseSubscriberDirectoryQuery(filters), page = parseSubscriberDirectoryPage(requestedPage);
          const cursor = parseSubscriberDirectoryCursor(after);
          if (!query || page === null || (after !== undefined && !cursor)) return invalidAction();
          return json(await readSubscriberDirectory(services.database, query, page, Date.now, cursor ?? undefined));
        }
        if (body.action === "grant") {
          const grant = readManualGrant(body);
          if (!grant) return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).manual({ accountId: id, ...grant }, owner.username));
        }
        if (body.action === "password-reset") {
          if (Object.keys(body).length !== 1) return invalidAction();
          if (!owner.memberAccountId) return json({ message: "Sign in as an administrator to open a password request." }, 401);
          const recovery = createPasswordRecovery({ database: services.database, config: services.config });
          const result = await recovery.openForSubscriber(id.toLowerCase(), owner.memberAccountId);
          return result.status === "ok" ? json({ status: "saved", requestId: result.requestId }) : json({ message: result.message }, 409);
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
        return codeAnswer(await createSubscribers(services.database, Date.now, services.config).action(id, body.action, body.value, owner.username));
      } catch { return storageUnavailable(); }
    },
  };
}

const batchSelection = {
  accountIds: z.array(z.uuid().transform(id => id.toLowerCase())).min(1).max(subscriberDirectoryPageSize),
  confirmed: z.literal(true),
  count: z.int().min(1).max(subscriberDirectoryPageSize),
};
const bulkAction = z.union([
  z.strictObject({ ...batchSelection, action: z.literal("grant"), requestId: z.uuid().transform(id => id.toLowerCase()),
    note: z.string().trim().min(1).max(200), planId: z.uuid().optional(), days: z.int().min(1).max(366).optional() }),
  z.strictObject({ ...batchSelection, action: z.enum(["block", "unblock"]), value: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...batchSelection, action: z.enum(["sign-out-all", "erase", "delete"]) }),
]);

type BulkResult = Readonly<{ accountId: string; status: "saved" }> | Readonly<{ accountId: string; status: "failed"; message: string }>;

/** Each account repeats the administrator check and has an independent target transaction. */
export function createSubscriberBulkHandler({ authorize = requireOwner } = {}) {
  return async ({ request, services, owner }: AdminContext): Promise<Response> => {
    if (!services.database) return storageUnavailable();
    if (!owner.memberAccountId) return json({ message: "Sign in as an administrator to manage subscribers." }, 401);
    const read = await readJsonBody(request);
    if ("refusal" in read) return read.refusal;
    const parsed = bulkAction.safeParse(read.body);
    if (!parsed.success) return invalidAction();
    const input = parsed.data;
    if (input.accountIds.length !== input.count || new Set(input.accountIds).size !== input.count
      || input.action === "grant" && !!input.days === !!input.planId) return invalidAction();
    if ("value" in input && auditTextErrors({ reason: input.value })) {
      return json({ message: "Use a reason without phone numbers or access codes." }, 400);
    }

    const subscribers = createSubscribers(services.database, Date.now, services.config);
    const codes = createAccessCodes({ database: services.database, config: services.config });
    const results: BulkResult[] = [];
    for (const accountId of input.accountIds) {
      try {
        const administrator = await authorize(services, request);
        if (administrator?.memberAccountId !== owner.memberAccountId) {
          results.push({ accountId, status: "failed", message: "Your administrator session ended. Sign in again." });
          continue;
        }
        const outcome = input.action === "grant"
          ? await codes.manual({ accountId, requestId: input.requestId, note: input.note, amountReceivedUgx: 0,
            ...(input.planId ? { planId: input.planId } : { durationDays: input.days! }) }, owner.username)
          : await subscribers.action(accountId, input.action, "value" in input ? input.value : undefined, owner.username, owner.memberAccountId);
        results.push("message" in outcome ? { accountId, status: "failed", message: outcome.message } : { accountId, status: "saved" });
      } catch {
        results.push({ accountId, status: "failed", message: "The change could not be confirmed for this account. Refresh before trying again." });
      }
    }
    const succeeded = results.filter(result => result.status === "saved").length;
    return json({ status: "completed", results, succeeded, failed: results.length - succeeded });
  };
}
