import "server-only";

import type { MemberServices } from "./member-http.ts";
import type { MemberIdentity } from "./member-sessions.ts";

export type MemberPageSession =
  | { kind: "guest" | "unavailable" }
  | { kind: "member"; member: MemberIdentity }
  | { kind: "verification" | "reset"; phone: string };

/** Authentication is independent of subscription availability. Failed reads never become a signed-out identity. */
export async function readMemberPageSession(services: Pick<MemberServices, "sessions" | "auth">, token?: string): Promise<MemberPageSession> {
  if (!services.sessions) return { kind: "unavailable" };
  try {
    const member = await services.sessions.verify(token);
    if (member) return { kind: "member", member };
    const [reset, verification] = await Promise.all([
      services.auth?.passwordResetSession(token),
      services.auth?.verificationSession(token),
    ]);
    if (reset) return { kind: "reset", phone: reset.phone };
    if (verification) return { kind: "verification", phone: verification.phone };
    return { kind: "guest" };
  } catch {
    return { kind: "unavailable" };
  }
}
