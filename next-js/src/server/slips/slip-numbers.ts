import "server-only";

import { formatSlipNumber } from "../../domain/readable-code.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** A unique fingerprint and database sequence serialize concurrent first exports. No selections are stored. */
export async function ensureSlipNumber(tx: Prisma.TransactionClient, fingerprint: string): Promise<string> {
  const [existing] = await tx.$queryRaw<{ number: number | bigint }[]>`SELECT number FROM SlipNumber WHERE fingerprint=${fingerprint}`;
  if (existing) return formatSlipNumber(existing.number);
  await tx.$executeRaw`INSERT IGNORE INTO SlipNumber (fingerprint) VALUES (${fingerprint})`;
  const [row] = await tx.$queryRaw<{ number: number | bigint }[]>`SELECT number FROM SlipNumber WHERE fingerprint=${fingerprint}`;
  if (!row) throw new Error("Slip numbering unavailable.");
  return formatSlipNumber(row.number);
}
