import { memberTokenHash, createMemberSessions } from "@/server/members/member-sessions";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
import { fixtureAdminPassword, fixtureAdminPhone, fixtureKey, fixtureTokens } from "./fixture-identity";

const revoked = new Set<string>();
const config = { production: false, key: fixtureKey,
  cookies: { session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude", secure: false } };
function session(hash: string) {
  const kind = Object.entries(fixtureTokens).find(([, token]) => memberTokenHash(token) === hash)?.[0];
  if (!kind || kind === "owner" || revoked.has(hash)) return null;
  const at = new Date(), administrator = ["administrator", "blocked", "erased", "expired", "stale"].includes(kind);
  return { tokenHash: hash, accountId: `00000000-0000-4000-8000-${administrator ? "000000000991" : "000000000101"}`,
    createdAt: at, lastSeenAt: at, authenticatedAt: kind === "pending" ? null : at, passwordResetAt: kind === "reset" ? at : null,
    expiresAt: new Date(+at + (kind === "expired" ? -1 : 86_400_000)), codeEnteredAt: null, accessCodeId: null,
    adminPasswordVersion: administrator ? kind === "stale" ? "stale" : fixtureKey("admin-password-version", `plain:${fixtureAdminPassword}`) : null,
    account: { phone: administrator ? fixtureAdminPhone : "256700000101", passwordHash: "synthetic registered password",
      phoneVerifiedAt: at, blockedAt: kind === "blocked" ? at : null, erasedAt: kind === "erased" ? at : null } };
}
const client = { $executeRaw: async () => 0, memberSession: {
  async findUnique({ where }: { where: { tokenHash: string } }) { return session(where.tokenHash); },
  async updateMany() { return { count: 0 }; },
  async deleteMany({ where }: { where: { tokenHash: string } }) { revoked.add(where.tokenHash); return { count: 1 }; },
} };
const services = { config,
  database: { query: async (run: (tx: typeof client) => unknown) => run(client) },
  auth: { verify: async (token: string) => token === fixtureTokens.owner ? { username: "legacy-owner", expiresAt: new Date(Date.now() + 86_400_000) } : null,
    logout: async () => {} },
} as unknown as AnalyticsServices;
export const fixtureAdminServices = async () => services;
export const fixtureMemberSessions = createMemberSessions({ config, database: services.database! });
export function restoreFixtureSession(token: string) { revoked.delete(memberTokenHash(token)); }
