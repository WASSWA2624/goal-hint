import "server-only";

import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { isMemberAdminPhone } from "./member-admin.ts";
import { createMemberSessions, validMemberToken, type MemberIdentity } from "./member-sessions.ts";

/** A phone allowlist grants nothing until the opaque cookie resolves to a current authenticated, unblocked account. */
export async function readMemberAdminSession(services: Readonly<{ database: DatabaseRuntime | null; config: AnalyticsConfig }>,
  token: string | undefined): Promise<MemberIdentity | null> {
  if (!services.database || !validMemberToken(token)) return null;
  const member = await createMemberSessions({ database: services.database, config: services.config }).verify(token);
  return member && !member.blocked && member.administrator && isMemberAdminPhone(member.phone) ? member : null;
}

/** Page and optional consumers fail closed when verification is unavailable. */
export async function verifyMemberAdminSession(services: Parameters<typeof readMemberAdminSession>[0], token: string | undefined) {
  try { return await readMemberAdminSession(services, token); } catch { return null; }
}
