import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultSubscriptionSettings } from "../../src/domain/subscription-settings.ts";
import { createSlipConfigurations } from "../../src/server/slips/slip-configurations.ts";
import { createMemberSessions, memberTokenHash } from "../../src/server/members/member-sessions.ts";
const at = new Date("2026-10-31T09:00:00Z"), DAY = 86_400_000;

export function slipConfigurationFixture() {
  const rows = new Map(), accounts = new Map(), sessions = new Map(), locks = [];
  let queue = Promise.resolve(), time = +at;
  function owner(token) {
    const id = randomUUID(), phone = `25670000000${accounts.size + 1}`;
    const account = { id, phone, passwordHash: "synthetic-password-hash", phoneVerifiedAt: at, blockedAt: null, erasedAt: null };
    const session = { tokenHash: memberTokenHash(token), accountId: id, authenticatedAt: at, passwordResetAt: null,
      expiresAt: new Date(+at + DAY), lastSeenAt: at, codeEnteredAt: null, accessCodeId: null };
    accounts.set(id, account); sessions.set(session.tokenHash, session);
    return { token, account, session, member: { ...session, phone, blocked: false } };
  }
  const first = owner("a".repeat(43)), second = owner("b".repeat(43));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => value && typeof value === "object" && "not" in value
    ? row[key] !== value.not : row[key] === value);
  const table = {
    async findMany({ where } = {}) { return [...rows.values()].filter(row => matches(row, where)).map(row => ({ ...row })); },
    async create({ data }) { const row = { revision: 1, ...data }; rows.set(row.id, row); return row; },
    async update({ where, data }) {
      const row = rows.get(where.id); assert.ok(row);
      for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
      return row;
    },
    async updateMany({ where, data }) { let count = 0; for (const row of rows.values()) if (matches(row, where)) { await this.update({ where: { id: row.id }, data }); count++; } return { count }; },
    async delete({ where }) { const row = rows.get(where.id); rows.delete(where.id); return row; },
  };
  const tx = { slipConfiguration: table, memberSession: { async findUnique({ where }) {
    const session = sessions.get(where.tokenHash); return session ? { ...session, account: accounts.get(session.accountId) } : null;
  } }, async $queryRaw(strings, ...values) { locks.push({ sql: strings.join("?"), values }); return []; } };
  const database = { async query(run) { return run(tx); }, transaction(run) {
    const pending = queue.then(async () => {
      const before = structuredClone(rows);
      try { return await run(tx); } catch (error) { rows.clear(); for (const row of before) rows.set(...row); throw error; }
    }); queue = pending.catch(() => {}); return pending;
  } };
  const config = { production: false, key() { return "synthetic-key"; } };
  const memberSessions = createMemberSessions({ database, config, now: () => time, adminPhone: () => false, adminPasswordHash: () => null });
  const restart = () => createSlipConfigurations({ database, now: () => time });
  const service = restart(), services = { config, sessions: memberSessions, configurations: service,
    settings: { settings: defaultSubscriptionSettings, source: "defaults" } };
  return { first, second, rows, sessions, locks, service, restart, services, advance(ms) { time += ms; } };
}
