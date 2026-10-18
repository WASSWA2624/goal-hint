import "server-only";

/** Denies asynchronous authority results and drains their rejections. */
export function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
/** True only for a synchronous, non-throwing `true` result. */
export function provenTrue(check: () => unknown): boolean { try { return synchronous(check()) === true; } catch { return false; } }
