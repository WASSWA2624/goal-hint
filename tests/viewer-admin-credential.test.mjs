import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { hashPassword } from '../src/server/analytics/analytics-password.ts';
import { defaultSubscriptionSettings } from '../src/domain/subscription-settings.ts';
import { createViewerAccess } from '../src/server/members/viewer-access.ts';

test('admin content access requires the current environment credential, even for an already paid allowlisted account', async () => {
  const originalPhones = process.env.GOAL_HINT_ADMIN_PHONES, originalHash = process.env.GOAL_HINT_ADMIN_PASSWORD_HASH,
    originalPassword = process.env.GOAL_HINT_ADMIN_PASSWORD;
  const phone = '256700000777', at = new Date('2026-10-21T12:00:00Z');
  const passwordHash = await hashPassword('synthetic admin password');
  const key = (purpose, value) => createHash('sha256').update(`${purpose}:${value}`).digest('hex');
  const row = { accountId: 'synthetic-admin', phone, passwordHash, blockedAt: null, lastSeenAt: at,
    entitled: 1, adminPasswordVersion: key('admin-password-version', passwordHash) };
  const resolver = createViewerAccess({ now: () => +at,
    services: async () => ({ config: { production: false, cookies: { session: 'owner' }, key }, auth: null,
      database: { query: work => work({ $queryRaw: async () => [row] }) } }),
    settings: async () => ({ settings: defaultSubscriptionSettings, source: 'database' }),
  });
  const read = () => resolver(name => name === 'goal-hint-member' ? 'a'.repeat(43) : undefined);
  try {
    process.env.GOAL_HINT_ADMIN_PHONES = JSON.stringify([phone]);
    delete process.env.GOAL_HINT_ADMIN_PASSWORD;
    process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = passwordHash;
    assert.equal((await read()).tier, 'full');
    row.adminPasswordVersion = null;
    assert.deepEqual(await read(), { tier: 'free', signedIn: false, mode: 'off' });
    row.adminPasswordVersion = key('admin-password-version', passwordHash);
    process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = await hashPassword('rotated synthetic admin password');
    assert.equal((await read()).tier, 'free');
    delete process.env.GOAL_HINT_ADMIN_PASSWORD_HASH;
    assert.equal((await read()).tier, 'free');
    row.phone = '256700000778';
    assert.equal((await read()).tier, 'full', 'ordinary approved subscribers do not need the admin credential');
  } finally {
    if (originalPhones === undefined) delete process.env.GOAL_HINT_ADMIN_PHONES; else process.env.GOAL_HINT_ADMIN_PHONES = originalPhones;
    if (originalHash === undefined) delete process.env.GOAL_HINT_ADMIN_PASSWORD_HASH; else process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = originalHash;
    if (originalPassword === undefined) delete process.env.GOAL_HINT_ADMIN_PASSWORD; else process.env.GOAL_HINT_ADMIN_PASSWORD = originalPassword;
  }
});
