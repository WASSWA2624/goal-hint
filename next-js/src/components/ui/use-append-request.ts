"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startRequestDeadline } from "../../domain/request-deadline";

type State = Readonly<{ scope: unknown; phase: "idle" | "loading" | "failed" }>;

/** Keep an append request local and discard results when the list cohort changes. */
export function useAppendRequest(scope: unknown, deadlineMs?: number) {
  const active = useRef<{ scope: unknown; controller: AbortController } | null>(null);
  const [state, setState] = useState<State>({ scope, phase: "idle" });
  const phase = state.scope === scope ? state.phase : "idle";

  useEffect(() => () => {
    const request = active.current;
    if (!request || request.scope !== scope) return;
    request.controller.abort();
    active.current = null;
  }, [scope]);

  const cancel = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
    setState({ scope, phase: "idle" });
  }, [scope]);

  async function append(read: (signal: AbortSignal) => Promise<void>) {
    if (active.current && active.current.scope === scope) return;
    const controller = new AbortController();
    active.current?.controller.abort();
    active.current = { scope, controller };
    const clearDeadline = deadlineMs === undefined ? undefined : startRequestDeadline(controller, deadlineMs);
    setState({ scope, phase: "loading" });
    try {
      await read(controller.signal);
      controller.signal.throwIfAborted();
      if (active.current?.controller === controller) setState({ scope, phase: "idle" });
    } catch {
      if (active.current?.controller === controller) setState({ scope, phase: "failed" });
    } finally {
      clearDeadline?.();
      if (active.current?.controller === controller) active.current = null;
    }
  }

  return { append, cancel, loading: phase === "loading", failed: phase === "failed" };
}

/** An overlapping record keeps its original position in the accumulated list. */
export function appendUniqueRecords<T, Key>(current: readonly T[], batch: readonly T[], key: (item: T) => Key): readonly T[] {
  const keys = new Set(current.map(key));
  const fresh = batch.filter(item => {
    const id = key(item);
    if (keys.has(id)) return false;
    keys.add(id);
    return true;
  });
  return fresh.length ? [...current, ...fresh] : current;
}
