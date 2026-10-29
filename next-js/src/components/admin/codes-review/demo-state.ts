"use client";

import { useCallback, useRef, useState } from "react";
import type { OwnerCode } from "@/domain/owner-members";
import { normalizePhone } from "@/domain/phone";
import { codeStatus, subscriptionDayMs } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { AdminReply, postAdmin } from "../admin-form";

const stamp = "2026-10-29T09:00:00.000Z";
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export const samplePlans: readonly SubscriptionPlanView[] = [
  { id: id(1), name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 0, createdAt: stamp, updatedAt: stamp },
  { id: id(2), name: "Daily", durationDays: 1, priceUgx: 1000, active: true, sortOrder: 1, createdAt: stamp, updatedAt: stamp },
  { id: id(3), name: "Monthly", durationDays: 30, priceUgx: 15000, active: true, sortOrder: 2, createdAt: stamp, updatedAt: stamp },
];

const statuses = ["active", "active", "queued", "expired", "active", "revoked", "active", "queued", "expired", "active", "active", "revoked"] as const;
export function sampleCodes(): OwnerCode[] {
  return statuses.map((status, index) => ({
    id: id(300 + index), accountId: id(100 + index), reference: `GH-${["K7M4", "N2R8", "P5V3", "T8L6", "B4H9", "C6W2", "F3X7", "J9D5", "M8A4", "R2E6", "V7S3", "Y5G8"][index]}`,
    phone: `256700000${String(101 + index)}`, planName: samplePlans[index % 3]!.name, source: index % 3 ? "payment" : "manual",
    startsAt: status === "queued" ? "2026-11-02T09:00:00.000Z" : "2026-10-27T09:00:00.000Z",
    endsAt: status === "expired" ? "2026-10-28T09:00:00.000Z" : "2026-11-05T09:00:00.000Z",
    status, daysLeft: status === "active" || status === "queued" ? 7 : 0,
  }));
}

const answer = (body: AdminReply["body"], status = 200): AdminReply => ({ ok: status < 400, status, body });
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** All preview operations remain in this mounted gallery; there is no fetch or storage transport. */
export function useCodeDemo() {
  const [codes, setCodes] = useState<readonly OwnerCode[]>(sampleCodes);
  const records = useRef(codes), sequence = useRef(1000);
  const replace = useCallback((next: readonly OwnerCode[]) => { records.current = next; setCodes(next); }, []);
  const reset = useCallback(() => { sequence.current = 1000; replace(sampleCodes()); }, [replace]);
  const request = useCallback<typeof postAdmin>(async (path, payload) => {
    if (path !== "/api/admin/codes") return answer({ message: "This sample only supports code actions." }, 400);
    const body = record(payload);
    if (body.action === "search") {
      const search = String(body.search ?? "").toLowerCase().replace(/[\s+()-]/gu, "");
      const canonical = normalizePhone(String(body.search ?? ""));
      return answer({ codes: records.current.filter(code => (body.status === "all" || !body.status || code.status === body.status)
        && (!search || code.reference.toLowerCase().replace(/-/gu, "").includes(search) || code.phone?.includes(canonical ?? search))) });
    }
    if (body.action === "manual") {
      const phone = normalizePhone(body.phone), note = String(body.note ?? "").trim();
      const plan = samplePlans.find(candidate => candidate.id === body.planId), days = plan?.durationDays ?? Number(body.days);
      if (!phone || !note || note.length > 200 || !Number.isInteger(days) || days < 1 || days > 366
        || !Number.isInteger(body.amount) || Number(body.amount) < 0 || Number(body.amount) > 4294967295) {
        return answer({ message: "Enter a valid phone number, duration, amount and reason." }, 400);
      }
      const at = new Date(), endsAt = new Date(at.getTime() + days * subscriptionDayMs).toISOString();
      const number = sequence.current++;
      replace([{ id: id(number), accountId: id(number + 1000), reference: `GH-DEMO${number}`, phone, planName: plan?.name ?? "Custom", source: "manual",
        startsAt: at.toISOString(), endsAt, status: "active", daysLeft: days }, ...records.current]);
      return answer({ status: "granted", endsAt, devicesUnlocked: 0 }, 201);
    }
    const selected = records.current.find(code => code.id === body.id);
    if (!selected) return answer({ message: "Select a sample record first." }, 400);
    if (selected.status === "revoked") return answer({ message: "This sample code is already revoked." }, 409);
    if (body.action === "revoke") {
      replace(records.current.map(code => code.id === selected.id ? { ...code, status: "revoked", daysLeft: 0 } : code));
      return answer({ status: "saved" });
    }
    if (body.action === "extend") {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 60) return answer({ message: "Choose between 1 and 60 days." }, 400);
      const now = new Date();
      replace(records.current.map(code => {
        if (code.id !== selected.id) return code;
        const period = { startsAt: new Date(code.startsAt), endsAt: new Date(new Date(code.endsAt).getTime() + days * subscriptionDayMs), revokedAt: null };
        return { ...code, status: codeStatus(period, now), endsAt: period.endsAt.toISOString(),
          daysLeft: Math.max(0, Math.ceil((period.endsAt.getTime() - Math.max(period.startsAt.getTime(), now.getTime())) / subscriptionDayMs)) };
      }));
      return answer({ status: "saved" });
    }
    return answer({ message: "Choose a supported sample action." }, 400);
  }, [replace]);
  return { codes, request, reset };
}
