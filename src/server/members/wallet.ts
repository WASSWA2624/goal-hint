import "server-only";

import { randomUUID } from "node:crypto";
import { formatPaymentReference } from "../../domain/payment.ts";
import type { WalletEntryView, WalletKind } from "../../domain/wallet.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export type WalletActor = "admin" | "member" | "system";
export type WalletWrite = Readonly<{ kind: WalletKind; amountUgx: number; actor: WalletActor; at: Date; paymentSubmissionId?: string;
  accessCodeId?: string; requestKey?: string; note?: string; allowNegative?: boolean }>;
export type WalletResult = Readonly<{ id: string; entryNumber: number; balanceAfter: number }>;

/** Raised inside a transaction when a debit would take a balance below zero; callers roll back with an "insufficient" outcome. */
export class InsufficientCredit extends Error {
  readonly balanceUgx: number;
  constructor(balanceUgx: number) { super("Not enough credit."); this.balanceUgx = balanceUgx; }
}

/**
 * The account's balance as of this transaction, from a locking read: a plain read after the lock may predate a spend another
 * transaction committed (REPEATABLE READ snapshots), so balances are always read FOR UPDATE.
 */
export async function lockedCredit(tx: Prisma.TransactionClient, accountId: string): Promise<number | null> {
  const [row] = await tx.$queryRaw<{ creditUgx: number | bigint }[]>`SELECT creditUgx FROM MemberAccount WHERE id = ${accountId} FOR UPDATE`;
  return row ? Number(row.creditUgx) : null;
}

/**
 * The only way credit changes: one ledger row and the cached balance in the same transaction, under the account's row lock.
 * The next entry number comes from a locking read too (a shared lock: FOR UPDATE would need an UPDATE grant the append-only
 * role does not have), so it is never a stale snapshot; UNIQUE(accountId, entryNumber) still refuses a duplicate, retried as
 * a constraint conflict. Debits below zero throw InsufficientCredit unless `allowNegative` (a reversal or a transferred
 * debt); the database CHECKs enforce the same rules.
 */
export async function appendWalletEntry(tx: Prisma.TransactionClient, accountId: string, entry: WalletWrite): Promise<WalletResult> {
  const balance = await lockedCredit(tx, accountId);
  if (balance === null) throw new Error("The account no longer exists.");
  const balanceAfter = balance + entry.amountUgx, entryNumber = await lastEntryNumber(tx, accountId) + 1, id = randomUUID();
  if (entry.amountUgx < 0 && balanceAfter < 0 && !entry.allowNegative) throw new InsufficientCredit(balance);
  await tx.walletEntry.create({ data: { id, accountId, entryNumber, kind: entry.kind, amountUgx: entry.amountUgx, balanceAfter,
    paymentSubmissionId: entry.paymentSubmissionId ?? null, accessCodeId: entry.accessCodeId ?? null, requestKey: entry.requestKey ?? null,
    actor: entry.actor, note: entry.note ?? null, createdAt: entry.at } });
  await tx.memberAccount.update({ where: { id: accountId }, data: { creditUgx: balanceAfter } });
  return { id, entryNumber, balanceAfter };
}

/**
 * The accounts credit given to `accountId` as its ledger entry `entryNumber` passed through, ending where it is now. A number
 * change carries the whole balance, so the credit left with the first move recorded at or after that entry, then with each
 * later move out of the account it reached; sequence orders moves exactly and only grows along the walk, so it ends. An
 * account with moves is never deleted, so every step is a real account. Locking reads see moves committed after this transaction's snapshot, so a caller holding the
 * returned accounts' locks knows the path cannot change.
 */
export async function creditPath(tx: Pick<Prisma.TransactionClient, "$queryRaw">, accountId: string, entryNumber: number): Promise<string[]> {
  type Move = { sequence: bigint | number; toAccountId: string };
  const path = [accountId];
  let [move] = await tx.$queryRaw<Move[]>`SELECT sequence, toAccountId FROM AccountMove WHERE fromAccountId = ${accountId}
    AND fromEntryNumber >= ${entryNumber} ORDER BY sequence LIMIT 1 LOCK IN SHARE MODE`;
  while (move) {
    path.push(move.toAccountId);
    [move] = await tx.$queryRaw<Move[]>`SELECT sequence, toAccountId FROM AccountMove WHERE fromAccountId = ${move.toAccountId}
      AND sequence > ${move.sequence} ORDER BY sequence LIMIT 1 LOCK IN SHARE MODE`;
  }
  return path;
}

/** The account's newest ledger entry number (0 for none), from a locking read so it is never an older snapshot's. */
export async function lastEntryNumber(tx: Pick<Prisma.TransactionClient, "$queryRaw">, accountId: string): Promise<number> {
  const [last] = await tx.$queryRaw<{ entryNumber: number | bigint }[]>`SELECT entryNumber FROM WalletEntry WHERE accountId = ${accountId}
    ORDER BY entryNumber DESC LIMIT 1 LOCK IN SHARE MODE`;
  return Number(last?.entryNumber ?? 0);
}

/** The newest ledger rows of an account, newest first, with the payment and period they name. */
export async function walletHistory(tx: Pick<Prisma.TransactionClient, "walletEntry">, accountId: string, take = 20): Promise<WalletEntryView[]> {
  const rows = await tx.walletEntry.findMany({ where: { accountId }, orderBy: { entryNumber: "desc" }, take,
    select: { id: true, kind: true, amountUgx: true, balanceAfter: true, createdAt: true, actor: true, note: true,
      paymentSubmission: { select: { reference: true } }, accessCode: { select: { reference: true } } } });
  return rows.map((row) => ({ id: row.id, kind: row.kind as WalletKind, amountUgx: row.amountUgx, balanceAfter: row.balanceAfter,
    createdAt: row.createdAt.toISOString(), actor: row.actor as WalletEntryView["actor"], note: row.note,
    payment: row.paymentSubmission ? formatPaymentReference(row.paymentSubmission.reference) : null,
    period: row.accessCode ? `C-${row.accessCode.reference}` : null }));
}
