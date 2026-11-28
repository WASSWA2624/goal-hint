export const viewerModes = [
  { id: "user", name: "User" },
  { id: "guest", name: "Guest" },
  { id: "member", name: "Free member" },
] as const;

export type ReviewViewer = typeof viewerModes[number]["id"];
export function reviewViewer(value: string | undefined): ReviewViewer {
  return viewerModes.find((mode) => mode.id === value)?.id ?? "user";
}

/** Fixture endpoints follow the chosen review persona, never a real account. */
export function requestViewer(request: Request): ReviewViewer {
  const referer = request.headers.get("referer");
  if (!referer) return "user";
  try { return reviewViewer(new URL(referer).searchParams.get("viewer") ?? undefined); }
  catch { return "user"; }
}
