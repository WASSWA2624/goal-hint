import "server-only";

import { createHmac } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyticsConfig } from "@/server/analytics/analytics-config";
import type { DatabaseRuntime } from "@/server/database/client";
import { createMemberSessions, memberTokenHash } from "@/server/members/member-sessions";
import type { MemberServices } from "@/server/members/member-http";

type Identity = "A" | "B";
type State = { schemaVersion: 1; active: Record<Identity, boolean>; writeAttempts: number };
export const identities = {
  A: { phone: "256700000701", token: "a".repeat(43), accountId: "00000000-0000-4000-8000-000000000701" },
  B: { phone: "256700000702", token: "b".repeat(43), accountId: "00000000-0000-4000-8000-000000000702" },
} as const;
export const config: AnalyticsConfig = { production: false, collecting: false, admin: null, adminProblem: null,
  usingDevelopmentCredentials: false, retentionDays: 30, geoSource: "timezone",
  cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" },
  key: (purpose: string, value: string) => createHmac("sha256", "synthetic-offline-identity-key").update(`${purpose}\0${value}`).digest("hex") };

async function file() {
  const marker = join(process.cwd(), ".offline-identity-fixture");
  if ((await readFile(marker, "utf8")).trim() !== "1") throw new Error("Owned fixture marker required.");
  const path = join(process.cwd(), "offline-identity-state.json");
  if (!(await lstat(path)).isFile()) throw new Error("Regular fixture state required.");
  return path;
}
export async function state(): Promise<State> {
  const value = JSON.parse(await readFile(await file(), "utf8")) as State;
  if (value.schemaVersion !== 1 || typeof value.active?.A !== "boolean" || typeof value.active?.B !== "boolean"
      || !Number.isSafeInteger(value.writeAttempts) || value.writeAttempts < 0) throw new Error("Invalid fixture state.");
  return value;
}
async function save(value: State) {
  const path = await file(), temporary = `${path}.next`;
  try { if (!(await lstat(temporary)).isFile()) throw new Error("Regular fixture staging required."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, path);
}
export async function attemptedWrite() {
  const value = await state(); value.writeAttempts++; await save(value);
}

function identityFor(hash: string): Identity | undefined {
  return (Object.keys(identities) as Identity[]).find(identity => memberTokenHash(identities[identity].token) === hash);
}
const client = { memberSession: {
  async findUnique({ where }: { where: { tokenHash: string } }) {
    const identity = identityFor(where.tokenHash), value = await state();
    if (!identity || !value.active[identity]) return null;
    const at = new Date(), entry = identities[identity];
    return { tokenHash: where.tokenHash, accountId: entry.accountId, createdAt: at, lastSeenAt: at, authenticatedAt: at,
      passwordResetAt: null, expiresAt: new Date(+at + 86_400_000), codeEnteredAt: at, accessCodeId: "synthetic-access",
      account: { phone: entry.phone, passwordHash: "synthetic-auth-adapter", phoneVerifiedAt: at, erasedAt: null, blockedAt: null } };
  },
  async updateMany() { return { count: 0 }; },
  async deleteMany({ where }: { where: { tokenHash: string } }) {
    const identity = identityFor(where.tokenHash), value = await state();
    if (identity) value.active[identity] = false;
    await save(value); return { count: identity ? 1 : 0 };
  },
} };
const database = { query: async (run: (tx: typeof client) => unknown) => run(client) } as unknown as DatabaseRuntime;
export const sessions = createMemberSessions({ database, config, adminPhone: () => false, adminPasswordHash: () => null });
export const source = async () => ({ config, sessions, auth: {
  async login(phone: unknown, _password: unknown, _address: string, previous?: string) {
    const identity = (Object.keys(identities) as Identity[]).find(key => identities[key].phone === phone);
    if (!identity) return { status: "unauthorized", message: "Synthetic identity unavailable." };
    const value = await state(), previousIdentity = previous ? identityFor(memberTokenHash(previous)) : undefined;
    if (previousIdentity) value.active[previousIdentity] = false;
    value.active[identity] = true; await save(value);
    return { status: "authenticated", ...identities[identity] };
  },
} }) as unknown as MemberServices;
