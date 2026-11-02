/** Read-only published-slip links never create an anonymous shared snapshot. */
export function publicBestSlipPath(locale: string, day: string, rank: number): string {
  return `/${locale}/best-slips/${day}/${rank}`;
}
