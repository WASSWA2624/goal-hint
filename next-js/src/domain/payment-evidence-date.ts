/** Date suggestions from Ugandan transfer evidence. Unzoned provider timestamps are EAT; users must check them. */
export function paymentEvidenceDate(text: string): string | null {
  const time = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?\s*(AM|PM)?\s*(Z|[+-]\d{2}:?\d{2})?`;
  const separator = String.raw`(?:T|[,\s]+(?:at\s+)?)`;
  const patterns = [
    new RegExp(String.raw`\b(20\d{2})-(\d{1,2})-(\d{1,2})${separator}${time}`, "iu"),
    new RegExp(String.raw`\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})${separator}${time}`, "iu"),
    new RegExp(String.raw`\b(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(20\d{2})${separator}${time}`, "iu"),
  ];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  for (const [index, pattern] of patterns.entries()) {
    const match = pattern.exec(text.slice(0, 12000)); if (!match) continue;
    const year = Number(match[index === 0 ? 1 : 3]), day = Number(match[index === 0 ? 3 : 1]);
    const month = index === 2 ? months.indexOf(match[2]!.slice(0, 3).toLowerCase()) + 1 : Number(match[2]);
    let hour = Number(match[4]); const minute = Number(match[5]), second = Number(match[6] ?? 0), meridiem = match[7]?.toUpperCase();
    if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || meridiem && hour < 1) continue;
    if (meridiem) hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
    const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) continue;
    const zone = match[8] ?? "+03:00", normalized = zone.replace(/^([+-]\d{2})(\d{2})$/u, "$1:$2");
    const value = new Date(`${check.toISOString().slice(0, 19)}${normalized}`);
    if (Number.isFinite(+value)) return value.toISOString();
  }
  return null;
}
