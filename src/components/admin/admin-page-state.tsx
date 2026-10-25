"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { seedPendingPayments } from "./pending-payments";

type RequestCount = { count: number | null; setCount: Dispatch<SetStateAction<number | null>> };
const PasswordRequestsContext = createContext<RequestCount>({ count: null, setCount: () => {} });

/** The owner layout owns only shared badge state, never page drafts or private records. */
export function AdminPageProvider({ children, passwordRequests = null }: { children: ReactNode; passwordRequests?: number | null }) {
  const [count, setCount] = useState(passwordRequests);
  const value = useMemo(() => ({ count, setCount }), [count]);
  return <PasswordRequestsContext value={value}>{children}</PasswordRequestsContext>;
}

export const usePasswordRequestCount = () => useContext(PasswordRequestsContext);

/** Each authorized page supplies fresh counts without replacing the persistent workspace. */
export function AdminPageState({ passwordRequests, pendingCount }: { passwordRequests: number | null; pendingCount?: number }) {
  const { setCount } = usePasswordRequestCount();
  useEffect(() => { setCount(passwordRequests); }, [passwordRequests, setCount]);
  useEffect(() => { if (pendingCount !== undefined) seedPendingPayments(pendingCount); }, [pendingCount]);
  return null;
}
