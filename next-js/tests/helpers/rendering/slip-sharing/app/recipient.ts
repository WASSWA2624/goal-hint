import { sharedSlipIdSchema, sharedSlipUrl } from "@/domain/shared-slips";
import { fixtureShared } from "./data";
export const fixtureAccess = (viewer?: string) => ({ tier: viewer === "eligible" ? "full" as const : "free" as const, signedIn: viewer === "member" || viewer === "eligible", mode: "test" as const });
export async function fixtureLanding(id: string, viewer?: string) {
  const access = fixtureAccess(viewer);
  if (!sharedSlipIdSchema.safeParse(id).success || id === "0".repeat(32)) return { access, result: { state: "missing" as const } };
  if (id === "f".repeat(32)) throw new Error("Synthetic storage failure");
  if (access.tier !== "full" && id !== "c".repeat(32)) return { access, result: { state: "restricted" as const } };
  return { access, result: { state: "available" as const, shared: { ...fixtureShared(), id, url: sharedSlipUrl(id) } } };
}
