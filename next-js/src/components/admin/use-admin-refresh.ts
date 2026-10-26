"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { refreshAdminData } from "@/app/(owner)/actions";

/** A failed refresh leaves the current editor intact; business mutations keep their own confirmed outcome. */
export function useAdminRefresh(onError: (message: string) => void) {
  const [refreshing, startRefresh] = useTransition();
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    startRefresh(async () => {
      try {
        await refreshAdminData();
      } catch (error) {
        // Authentication redirects and other framework control flow must reach the router boundary.
        unstable_rethrow(error);
        if (mounted.current) onError("The latest data could not be loaded. Your current view has been kept. Please retry.");
      } finally {
        pending.current = false;
      }
    });
  }, [onError]);

  return { refreshing, refresh };
}
