import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSlipNumber, slipNumberFingerprint } from '../src/domain/readable-code.ts';
import { ensureSlipNumber } from '../src/server/slips/slip-numbers.ts';
import { ensureReferralCode, createReferrals } from '../src/server/members/referrals.ts';
import { validReferralCode } from '../src/domain/referrals.ts';
import { signReferralAttribution, readReferralAttribution } from '../src/server/members/referral-attribution.ts';
import { createMemberAuthFixture } from './helpers/member-auth-fixture.mjs';

test('references preserve leading zeros, stable identities and the eight-digit capacity', async () => {
  assert.equal(formatSlipNumber(1), '00000001'); assert.equal(formatSlipNumber(99999999), '99999999');
  assert.equal(formatSlipNumber(1n),'00000001'); assert.throws(()=>formatSlipNumber(100000000n),RangeError);
  for (const number of [0, -1, 1.5, 100000000, NaN]) assert.throws(() => formatSlipNumber(number), RangeError);
  const a = await slipNumberFingerprint({id:'original'});
  assert.match(a, /^[a-f0-9]{64}$/); assert.equal(a, await slipNumberFingerprint({id:'original', status:'won'}));
  assert.notEqual(a, await slipNumberFingerprint({id:'different'}));
  let writes = 0;
  const rows = new Map(), tx = { $queryRaw: async (_sql, fingerprint) => rows.has(fingerprint) ? [{number:rows.get(fingerprint)}] : [],
    $executeRaw: async (_sql, fingerprint) => { writes++; if (!rows.has(fingerprint)) rows.set(fingerprint, rows.size + 1); } };
  const numbers = await Promise.all(Array.from({length:20}, () => ensureSlipNumber(tx, a)));
  assert.equal(new Set(numbers).size, 1); assert.equal(numbers[0], '00000001');
  const before = writes; assert.equal(await ensureSlipNumber(tx,a), numbers[0]); assert.equal(writes,before);
});

test('referral conversion retries collisions and retains legacy invitation attribution', async () => {
  const f = createMemberAuthFixture(), owner = await f.authenticate(), old = 'a'.repeat(32);
  f.accounts.get(owner.member.accountId).referralCode = old;
  const update = f.tx.memberAccount.update;
  let calls=0;
  f.tx.memberAccount.update = async args => {
    if (++calls === 1) throw Object.assign(new Error('synthetic collision'), {code:'P2002'});
    return update(args);
  };
  assert.equal(await ensureReferralCode(f.tx,{id:owner.member.accountId,referralCode:old},()=>calls ? '00000002':'00000001'),'00000002');
  assert.equal(f.accounts.get(owner.member.accountId).legacyReferralCode,old);
  const referrals=createReferrals({database:f.database,now:f.now});
  assert.equal(await referrals.inviter(old),true); assert.equal(await referrals.inviter('00000002'),true);
  for (const code of [old,'00000002']) {
    assert.equal(validReferralCode(code),true);
    assert.deepEqual(readReferralAttribution(f.config,signReferralAttribution(f.config,code,f.now()),f.now()),{code,at:f.now()});
  }
  for (const code of ['0000001','000000001','ABCDEFGH','12345678?']) assert.equal(validReferralCode(code),false);
});
