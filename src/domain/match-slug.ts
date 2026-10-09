/** Shared by feed links and the detail service; fixture identity remains authoritative. */
export function canonicalMatchSlug(home: string | null, away: string | null): string {
  const part = (name: string | null, fallback: string) => name?.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 75).replace(/-+$/gu, "") || fallback;
  return `${part(home, "home")}-vs-${part(away, "away")}`;
}
