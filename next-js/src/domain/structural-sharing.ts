function plainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Reuse unchanged branches of acyclic plain-data snapshots without mutating either input. */
export function shareUnchanged<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return next;
  const array = Array.isArray(next);
  if (array !== Array.isArray(previous) || Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) return next;
  if (!array && !plainObject(next)) return next;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let unchanged = Object.keys(before).length === keys.length && (!array || before.length === after.length);
  let shared: Record<string, unknown> | undefined;
  for (const key of keys) {
    const present = Object.hasOwn(before, key);
    const value = present ? shareUnchanged(before[key], after[key]) : after[key];
    if (!present || !Object.is(value, before[key])) unchanged = false;
    if (!Object.is(value, after[key])) {
      shared ??= (array ? Object.assign((next as unknown[]).slice(), next)
        : Object.getPrototypeOf(next) === null ? Object.assign(Object.create(null), next) : { ...next }) as Record<string, unknown>;
      Object.defineProperty(shared, key, { value, enumerable: true, configurable: true, writable: true });
    }
  }
  return unchanged ? previous : (shared ?? next) as T;
}
