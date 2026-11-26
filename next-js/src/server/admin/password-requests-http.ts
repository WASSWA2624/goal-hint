import "server-only";

import { z } from "zod";
import { passwordRequestOwnershipMethods, passwordRequestSentChannels, type PasswordRequestDetails, type PasswordRequestOwnershipMethod, type PasswordRequestSentChannel } from "../../domain/admin-password-requests.ts";
import { passwordResetPagePath } from "../../domain/password-reset-links.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { authCopy } from "../../i18n/messages/auth.ts";
import type { AnalyticsServices } from "../analytics/analytics-http.ts";
import { json } from "../http/private-http.ts";
import { createPasswordRecovery } from "../members/password-recovery.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";

const requestId = z.uuid();
const mutation = z.discriminatedUnion("action", [
  z.strictObject({ id: requestId, action: z.literal("verify-ownership"), method: z.enum(Object.keys(passwordRequestOwnershipMethods) as PasswordRequestOwnershipMethod[]), confirmed: z.literal(true) }),
  z.strictObject({ id: requestId, action: z.literal("generate-link"), generation: z.int().nonnegative() }),
  z.strictObject({ id: requestId, action: z.literal("mark-sent"), channel: z.enum(Object.keys(passwordRequestSentChannels) as PasswordRequestSentChannel[]), generation: z.int().positive(), confirmed: z.literal(true) }),
]);

const fail = (status: number, error: string, message: string) => json({ error, message }, status);
const invalid = () => fail(400, "invalid", "Check the password request and try again.");
const unavailable = () => fail(503, "unavailable", "Password requests are temporarily unavailable. Try again.");

function recoveryFor(services: AnalyticsServices) {
  return services.database ? createPasswordRecovery({ database: services.database, config: services.config }) : null;
}

export async function readAdminPasswordRequests(services: AnalyticsServices) {
  return await recoveryFor(services)?.listRequests() ?? null;
}

/** Resolve hosted links using deployment identity, never a request's Host or forwarded headers. */
export function passwordResetLink(token: string, requestUrl: string, deployment = process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT) {
  const request = new URL(requestUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(request.hostname) && ["http:", "https:"].includes(request.protocol);
  const origin = deployment === "staging" ? "https://test.goalhint.com" : deployment !== "production" && local ? request.origin : publicPolicy.origin;
  return new URL(`${passwordResetPagePath}#${token}`, origin).href;
}

type Recovery = NonNullable<ReturnType<typeof recoveryFor>>;
type RecoveryDetail = NonNullable<Awaited<ReturnType<Recovery["requestDetail"]>>>;
function details(detail: RecoveryDetail, request: Request): PasswordRequestDetails {
  const { id, phone, requestedAt, status, accountId, accountCreatedAt, phoneVerifiedAt, ownershipVerifiedAt, ownershipMethod,
    generatedAt, expiresAt, generation, token, markedSentAt, markedSentChannel, completedAt } = detail;
  return { id, phone, requestedAt, status, accountId, accountCreatedAt, phoneVerifiedAt, ownershipVerifiedAt,
    ownershipMethod: Object.hasOwn(passwordRequestOwnershipMethods, ownershipMethod ?? "") ? ownershipMethod as PasswordRequestOwnershipMethod : null,
    generatedAt, expiresAt, generation, link: token ? passwordResetLink(token, request.url) : null, markedSentAt,
    markedSentChannel: Object.hasOwn(passwordRequestSentChannels, markedSentChannel ?? "") ? markedSentChannel as PasswordRequestSentChannel : null,
    completedAt };
}

export function createAdminPasswordRequestHandlers({ create = createPasswordRecovery } = {}) {
  async function run({ request, owner, services }: AdminContext) {
    if (!owner.memberAccountId) return fail(401, "unauthorized", authCopy.administratorRequired);
    if (!services.database) return unavailable();
    try {
      const recovery = create({ database: services.database, config: services.config });
      if (request.method === "GET") {
        const query = new URL(request.url).searchParams;
        if (query.size === 0) return json({ requests: await recovery.listRequests() });
        if (query.size !== 1) return invalid();
        if (query.get("count") === "1") return json({ pendingCount: await recovery.pendingCount() });
        const id = requestId.safeParse(query.get("id"));
        if (!id.success) return invalid();
        const detail = await recovery.requestDetail(id.data);
        return detail ? json({ request: details(detail, request) }) : fail(404, "missing", "This password request is no longer available.");
      }
      const read = await readJsonBody(request, 4096);
      if ("refusal" in read) return read.refusal;
      const input = mutation.safeParse(read.body);
      if (!input.success) return invalid();
      const action = input.data, actor = owner.memberAccountId;
      const result = action.action === "verify-ownership" ? await recovery.verifyOwnership(action.id, actor, action.method)
        : action.action === "generate-link" ? await recovery.generateLink(action.id, actor, action.generation)
        : await recovery.markSent(action.id, actor, action.channel, action.generation);
      if (result.status === "ok") return json({ request: details(result.request, request) });
      return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.status, result.message);
    } catch { return unavailable(); }
  }
  return { GET: run, POST: run };
}
