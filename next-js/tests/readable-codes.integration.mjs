import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { paidDatabase } from './helpers/paid-database.mjs';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { ensureSlipNumber } from '../src/server/slips/slip-numbers.ts';
import { ensureReferralCode } from '../src/server/members/referrals.ts';

test('actual migrations enforce unique bounded slip numbers, concurrent deduplication and legacy referral aliases', {timeout:180000}, async t => {
  let f;
  const at=new Date(),id=randomUUID(),old='d'.repeat(32);
  try { f=await paidDatabase({beforeCheckout:root=>root.query('INSERT INTO MemberAccount(id,phone,referralCode,createdAt,lastSignInAt) VALUES(?,?,?,?,?)',[id,'256700009183',old,at,at])}); }
  catch(error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message);return; }
  t.after(()=>f.close());
  assert.equal((await f.database.query(tx=>tx.memberAccount.findUniqueOrThrow({where:{id}}))).legacyReferralCode,old);
  const fingerprint='a'.repeat(64);
  const numbers=await Promise.all(Array.from({length:12},()=>f.database.transaction(tx=>ensureSlipNumber(tx,fingerprint),{isolationLevel:'ReadCommitted'})));
  assert.equal(new Set(numbers).size,1); assert.match(numbers[0],/^[0-9]{8}$/);
  assert.equal(Number((await f.root.query('SELECT COUNT(*) AS n FROM SlipNumber'))[0].n),1);
  await assert.rejects(f.root.query('INSERT INTO SlipNumber(number,fingerprint) VALUES(100000000,?)',['b'.repeat(64)]));
  await f.database.query(tx=>tx.memberAccount.create({data:{id:randomUUID(),phone:'256700009184',referralCode:'00000001',createdAt:at,lastSignInAt:at}}));
  let attempt=0;
  const code=await f.database.transaction(tx=>ensureReferralCode(tx,{id,referralCode:old},()=>++attempt===1?'00000001':'00000002'));
  const row=await f.database.query(tx=>tx.memberAccount.findUniqueOrThrow({where:{id}}));
  assert.equal(code,'00000002');assert.equal(attempt,2);assert.equal(row.legacyReferralCode,old);assert.equal(row.referralCode,code);
  await assert.rejects(f.root.query('UPDATE MemberAccount SET referralCode=? WHERE id=?',['badcode',id]));
});
