/** Display grouping never enters the persisted integer amount. */
export const integerDigits = (value: string) => value.replace(/\D/gu, "");
export const groupInteger = (value: string) => integerDigits(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");

export function digitCaret(value: string, count: number) {
  if (count <= 0) return 0;
  let digits = 0;
  for (let index = 0; index < value.length; index++) if (/\d/u.test(value[index]!) && ++digits === count) return index + 1;
  return value.length;
}

/** Backspace/Delete beside grouping removes a digit rather than repeatedly restoring the separator. */
export function deleteGroupedDigit(value: string, start: number, end: number, key: string) {
  if (start !== end || key !== "Backspace" && key !== "Delete") return null;
  let index = key === "Backspace" ? start - 1 : start;
  if (index < 0 || index >= value.length || /\d/u.test(value[index]!)) return null;
  const direction = key === "Backspace" ? -1 : 1;
  while (index >= 0 && index < value.length && !/\d/u.test(value[index]!)) index += direction;
  if (index < 0 || index >= value.length) return null;
  return { value: value.slice(0, index) + value.slice(index + 1), digitsBefore: integerDigits(value.slice(0, index)).length };
}
