import "server-only";
import { z } from "zod";
import { createAccessCodes } from "../members/access-codes.ts";
import { createPasswordRecovery } from "../members/password-recovery.ts";
import { json } from "../http/private-http.ts";
import { authCopy } from "../../i18n/messages/auth.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createUsers } from "./users.ts";
import { parseUserDirectoryCursor, parseUserDirectoryPage, parseUserDirectoryQuery, userDirectoryPageSize } from "../../domain/user-directory.ts";
import { readUserDirectory } from "./user-directory.ts";
import { codeAnswer, invalidAction, readManualGrant, storageUnavailable, uuid } from "./codes-http.ts";
import { auditTextErrors } from "./audit.ts";
import { requireOwner } from "./owner-auth.ts";

const userActions = new Set(["grant", "password-reset", "change-number", "credit-adjust", "note", "sign-out-selected", "sign-out-all", "auto-renew-off", "block", "unblock", "erase", "delete"]);
const userId = (request: Request) => new URL(request.url).pathname.match(/\/users\/([^/]+)$/u)?.[1];

export function createUserHandlers() {
  return {
    async GET({ request, services }: AdminContext) {
      const id = userId(request);
      if (!uuid(id)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        const detail = await createUsers(services.database).detail(id.toLowerCase());
        return detail ? json({ detail }) : json({ message: "This user could not be found." }, 404);
      } catch { return storageUnavailable(); }
    },
    async POST(context: AdminContext) {
      const { services, owner, request } = context;
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const body = read.body, id = userId(request);
      if (id === undefined ? body.action !== undefined : !uuid(id) || typeof body.action !== "string" || !userActions.has(body.action)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        if (id === undefined) {
          const { page: requestedPage, after, ...filters } = body;
          const query = parseUserDirectoryQuery(filters), page = parseUserDirectoryPage(requestedPage);
          const cursor = parseUserDirectoryCursor(after);
          if (!query || page === null || (after !== undefined && !cursor)) return invalidAction();
          return json(await readUserDirectory(services.database, query, page, Date.now, cursor ?? undefined));
        }
        if (body.action === "grant") {
          const grant = readManualGrant(body);
          if (!grant) return invalidAction();
          return codeAnswer(await createAccessCodes({ database: services.database, config: services.config }).manual({ accountId: id, ...grant }, owner.username));
        }
        if (body.action === "password-reset") {
          if (Object.keys(body).length !== 1) return invalidAction();
          if (!owner.memberAccountId) return json({ message: authCopy.passwordRequestAdminRequired }, 401);
          const recovery = createPasswordRecovery({ database: services.database, config: services.config });
          const result = await recovery.openForUser(id.toLowerCase(), owner.memberAccountId);
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
        return codeAnswer(await createUsers(services.database, Date.now, services.config).action(id, body.action, body.value, owner.username));
      } catch { return storageUnavailable(); }
    },
  };
}

const batchSelection = {
  accountIds: z.array(z.uuid().transform(id => id.toLowerCase())).min(1).max(userDirectoryPageSize),
  confirmed: z.literal(true),
  count: z.int().min(1).max(userDirectoryPageSize),
};
const bulkAction = z.union([
  z.strictObject({ ...batchSelection, action: z.literal("grant"), requestId: z.uuid().transform(id => id.toLowerCase()),
    note: z.string().trim().min(1).max(200), planId: z.uuid().optional(), days: z.int().min(1).max(366).optional() }),
  z.strictObject({ ...batchSelection, action: z.enum(["block", "unblock"]), value: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...batchSelection, action: z.enum(["sign-out-all", "erase", "delete"]) }),
]);

type BulkResult = Readonly<{ accountId: string; status: "saved" }> | Readonly<{ accountId: string; status: "failed"; message: string }>;

/** Each account repeats the administrator check and has an independent target transaction. */
export function createUserBulkHandler({ authorize = requireOwner } = {}) {
  return async ({ request, services, owner }: AdminContext): Promise<Response> => {
    if (!services.database) return storageUnavailable();
    if (!owner.memberAccountId) return json({ message: authCopy.manageUsersAdminRequired }, 401);
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

    const users = createUsers(services.database, Date.now, services.config);
    const codes = createAccessCodes({ database: services.database, config: services.config });
    const results: BulkResult[] = [];
    for (const accountId of input.accountIds) {
      try {
        const administrator = await authorize(services, request);
        if (administrator?.memberAccountId !== owner.memberAccountId) {
          results.push({ accountId, status: "failed", message: authCopy.administratorSessionEnded });
          continue;
        }
        const outcome = input.action === "grant"
          ? await codes.manual({ accountId, requestId: input.requestId, note: input.note, amountReceivedUgx: 0,
            ...(input.planId ? { planId: input.planId } : { durationDays: input.days! }) }, owner.username)
          : await users.action(accountId, input.action, "value" in input ? input.value : undefined, owner.username, owner.memberAccountId);
        results.push("message" in outcome ? { accountId, status: "failed", message: outcome.message } : { accountId, status: "saved" });
      } catch {
        results.push({ accountId, status: "failed", message: "The change could not be confirmed for this account. Refresh before trying again." });
      }
    }
    const succeeded = results.filter(result => result.status === "saved").length;
    return json({ status: "completed", results, succeeded, failed: results.length - succeeded });
  };
}
