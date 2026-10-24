import "server-only";

import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount, type CodeOutcome } from "../members/access-codes.ts";
import { decide } from "../members/settings.ts";

const unavailable = (): CodeOutcome => ({ status: "refused", message: "This account is unavailable." });
const unique = (values: readonly (string | null)[]) => [...new Set(values.filter((value): value is string => value !== null))];
type Client = Prisma.TransactionClient;

/** Read identifiers before deleting their only remaining owners, including old phones and expired sessions. */
async function deletionScope(tx: Client, id: string) {
  const account = await tx.memberAccount.findUnique({ where: { id }, select: { phone: true } });
  if (!account) return null;
  const [codes, payments, sessions, verifications, slips, wallet] = await Promise.all([
    tx.accessCode.findMany({ where: { accountId: id }, select: { id: true, reference: true } }),
    tx.paymentSubmission.findMany({ where: { accountId: id }, select: { id: true, reference: true, submittedSessionHash: true } }),
    tx.memberSession.findMany({ where: { accountId: id }, select: { tokenHash: true } }),
    tx.memberVerification.findMany({ where: { accountId: id }, select: { id: true, phone: true } }),
    tx.savedSlip.findMany({ where: { accountId: id }, select: { id: true } }),
    // Ledger rows go with the account by cascade (no trigger fires); their ids are scrubbed from audit details like the rest.
    tx.walletEntry.findMany({ where: { accountId: id }, select: { id: true } }),
  ]);
  const phones = unique([account.phone, ...verifications.map(row => row.phone)]);
  const phoneAccounts = phones.length ? await tx.memberAccount.findMany({
    where: { id: { not: id }, phone: { in: phones } }, select: { id: true, phone: true },
  }) : [];
  const reassignedPhones = new Set(phoneAccounts.map(row => row.phone));
  // A historical phone may now belong to another member; preserve records attributable only to that reassigned phone.
  const exclusivePhones = phones.filter(phone => !reassignedPhones.has(phone));
  const unbound = exclusivePhones.length ? await tx.memberVerification.findMany({
    where: { accountId: null, phone: { in: exclusivePhones } }, select: { id: true },
  }) : [];
  const sessionHashes = unique([...sessions.map(row => row.tokenHash), ...payments.map(row => row.submittedSessionHash)]);
  const actors = [id, `member-admin:${id}`];
  const identifiers = unique([id, ...actors, ...codes.flatMap(row => [row.id, `C-${row.reference}`]),
    ...payments.flatMap(row => [row.id, formatPaymentReference(row.reference), `P-${row.reference}`]), ...sessionHashes,
    ...verifications.map(row => row.id), ...unbound.map(row => row.id), ...slips.map(row => row.id), ...wallet.map(row => row.id)]);
  return { id, actors, exclusivePhones, phoneAccountIds: phoneAccounts.map(row => row.id),
    sessionHashes, identifiers, codeIds: codes.map(row => row.id), paymentIds: payments.map(row => row.id) };
}
type Scope = NonNullable<Awaited<ReturnType<typeof deletionScope>>>;

/** Audit JSON can refer to a different account after a number transfer or payment reversal. */
async function relatedAudit(tx: Client, scope: Scope) {
  const ids = new Set<bigint>();
  // Bound the number of placeholders while searching every structured reference, including nested JSON.
  for (let offset = 0; offset < scope.identifiers.length; offset += 200) {
    const identifiers = scope.identifiers.slice(offset, offset + 200);
    const matches = identifiers.map(value => Prisma.sql`JSON_SEARCH(details, 'one', ${value}) IS NOT NULL`);
    const rows = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`SELECT id FROM OwnerAuditEvent
      WHERE accountId = ${scope.id} OR actor IN (${Prisma.join(scope.actors)})
        OR targetId IN (${Prisma.join(identifiers)}) OR (${Prisma.join(matches, " OR ")})`);
    for (const row of rows) ids.add(row.id);
  }
  return ids.size ? tx.ownerAuditEvent.findMany({ where: { id: { in: [...ids] } } }) : [];
}

function foreignCodeWhere(scope: Scope): Prisma.AccessCodeWhereInput {
  return { accountId: { not: scope.id }, OR: [
    { replacedById: { in: scope.codeIds } }, { paymentSubmissionId: { in: scope.paymentIds } }, { createdBy: { in: scope.actors } },
  ] };
}

function foreignPaymentWhere(scope: Scope): Prisma.PaymentSubmissionWhereInput {
  return { accountId: { not: scope.id }, OR: [
    { payerPhone: { in: scope.exclusivePhones } }, { submittedSessionHash: { in: scope.sessionHashes } }, { decidedBy: { in: scope.actors } },
  ] };
}

async function relatedRows(tx: Client, scope: Scope) {
  const [codes, payments, audit] = await Promise.all([
    tx.accessCode.findMany({ where: foreignCodeWhere(scope), select: { accountId: true } }),
    tx.paymentSubmission.findMany({ where: foreignPaymentWhere(scope), select: { accountId: true } }),
    relatedAudit(tx, scope),
  ]);
  return { audit, accountIds: unique([scope.id, ...scope.phoneAccountIds, ...codes.map(row => row.accountId), ...payments.map(row => row.accountId),
    ...audit.map(row => row.accountId)]).sort() };
}

/** Remove references from another member's audit entry without deleting that member's event. */
function scrubReferences(value: Prisma.JsonValue, identifiers: ReadonlySet<string>): Prisma.InputJsonValue | null {
  if (typeof value === "string") return identifiers.has(value) ? null : value;
  if (Array.isArray(value)) return value.filter(item => typeof item !== "string" || !identifiers.has(item))
    .map(item => scrubReferences(item, identifiers));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !identifiers.has(key) && (typeof item !== "string" || !identifiers.has(item)))
    .map(([key, item]) => [key, scrubReferences(item!, identifiers)]));
  return value;
}

function rateLimitKeys(scope: Scope, config: Pick<AnalyticsConfig, "key">) {
  return unique([
    ...["current-password-account", "save-slip"].map(purpose => config.key(`member-${purpose}`, scope.id)),
    ...scope.exclusivePhones.flatMap(phone => ["password-login-phone", "register-phone"].map(purpose => config.key(`member-${purpose}`, phone))),
    ...scope.sessionHashes.flatMap(hash => ["upload-attempts", "upload-stored", "trial-session"]
      .map(purpose => config.key(`member-${purpose}`, hash))),
  ]);
}

/** Permanent deletion is one transaction. Shared catalog, plans and site/address throttles have no member owner. */
export async function deleteSubscriber(database: DatabaseRuntime, id: string, config: Pick<AnalyticsConfig, "key">): Promise<CodeOutcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const discovered = await database.query(async tx => {
      const scope = await deletionScope(tx, id);
      return scope ? relatedRows(tx, scope) : null;
    });
    if (!discovered) return unavailable();
    try {
      const outcome = await decide<CodeOutcome | Readonly<{ status: "retry" }>>(database, async (tx, rollback) => {
        // Match number transfers' sorted account locks; re-discover after locking to catch concurrent new references.
        for (const accountId of discovered.accountIds) await lockMemberAccount(tx, accountId);
        const scope = await deletionScope(tx, id);
        if (!scope) return rollback(unavailable());
        const related = await relatedRows(tx, scope);
        if (related.accountIds.some(accountId => !discovered.accountIds.includes(accountId))) return rollback({ status: "retry" });
        // Number changes are history that other accounts' credit is traced by, so such an account is erased, never deleted.
        if (await tx.accountMove.count({ where: { OR: [{ fromAccountId: id }, { toAccountId: id }] } })) {
          const erased = !!(await tx.memberAccount.findUnique({ where: { id }, select: { erasedAt: true } }))?.erasedAt;
          return rollback({ status: "refused", message: erased
            ? "This account's access or credit moved between numbers, so its records stay for accounting and it can't be deleted."
            : "This account's access or credit moved between numbers, so it can't be deleted. Erase its personal data instead." });
        }

        await tx.savedSlip.deleteMany({ where: { accountId: id } }); // Fixture links cascade; the fixtures remain shared.
        await tx.memberSession.deleteMany({ where: { accountId: id } });
        await tx.memberVerification.deleteMany({ where: { OR: [
          { accountId: id }, { accountId: null, phone: { in: scope.exclusivePhones } },
        ] } });
        await tx.rateLimitBucket.deleteMany({ where: { key: { in: rateLimitKeys(scope, config) } } });

        // A transfer may have moved access to another member. Preserve it while removing its links to deleted records.
        await tx.accessCode.updateMany({ where: { OR: [{ accountId: id }, { replacedById: { in: scope.codeIds } }] }, data: { replacedById: null } });
        await tx.accessCode.updateMany({ where: { accountId: { not: id }, paymentSubmissionId: { in: scope.paymentIds } },
          data: { paymentSubmissionId: null, source: "reissue" } }); // The schema requires payment source iff a payment exists.
        await tx.accessCode.updateMany({ where: { accountId: { not: id }, createdBy: { in: scope.actors } }, data: { createdBy: "deleted-admin" } });
        await tx.paymentSubmission.updateMany({ where: { accountId: { not: id }, payerPhone: { in: scope.exclusivePhones } }, data: { payerPhone: null } });
        await tx.paymentSubmission.updateMany({ where: { accountId: { not: id }, submittedSessionHash: { in: scope.sessionHashes } }, data: { submittedSessionHash: null } });
        await tx.paymentSubmission.updateMany({ where: { accountId: { not: id }, decidedBy: { in: scope.actors } }, data: { decidedBy: "deleted-admin" } });
        await tx.subscriptionSettings.updateMany({ where: { updatedBy: { in: scope.actors } }, data: { updatedBy: "deleted-admin" } });

        const identifiers = new Set(scope.identifiers), actors = new Set(scope.actors), auditIds: bigint[] = [];
        for (const event of related.audit) {
          if (event.accountId === id || actors.has(event.actor) || identifiers.has(event.targetId)) auditIds.push(event.id);
          else {
            const details = scrubReferences(event.details, identifiers);
            await tx.ownerAuditEvent.update({ where: { id: event.id }, data: { details: details ?? Prisma.JsonNull } });
          }
        }
        if (auditIds.length) await tx.ownerAuditEvent.deleteMany({ where: { id: { in: auditIds } } });
        await tx.paymentScreenshot.deleteMany({ where: { submissionId: { in: scope.paymentIds } } });
        await tx.accessCode.deleteMany({ where: { accountId: id } });
        await tx.paymentSubmission.deleteMany({ where: { accountId: id } });
        await tx.memberAccount.delete({ where: { id } });
        // Do not recreate an account-linked audit record after removing all of this account's information.
        return { status: "saved" };
      });
      if (outcome.status !== "retry") return outcome;
    } catch (error) {
      if (attempt === 3 || !(error instanceof DatabaseOperationError) || !["conflict", "constraint"].includes(error.code)) throw error;
    }
  }
  return { status: "refused", message: "The account changed while it was being deleted. Try again." };
}
