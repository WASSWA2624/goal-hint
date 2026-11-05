export type SelectOptionEntry<T> = Readonly<{ option: T; index: number }>;

/** Keep the first occurrence, matching Array.find/findIndex without rescanning every rendered option. */
export function indexSelectOptions<T extends Readonly<{ value: string }>>(options: readonly T[]): ReadonlyMap<string, SelectOptionEntry<T>> {
  const entries = new Map<string, SelectOptionEntry<T>>();
  options.forEach((option, index) => {
    const value = option.value;
    if (!entries.has(value)) entries.set(value, { option, index });
  });
  return entries;
}
