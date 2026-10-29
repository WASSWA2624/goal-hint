"use client";

import { useEffect } from "react";
import { seedPendingPayments } from "./pending-payments";

/** Authorized payment pages seed the shared live badge without replacing the workspace. */
export function AdminPageState({ pendingCount }: { pendingCount: number }) {
  useEffect(() => { seedPendingPayments(pendingCount); }, [pendingCount]);
  return null;
}
