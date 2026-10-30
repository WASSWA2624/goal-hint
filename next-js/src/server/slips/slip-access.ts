import "server-only";

import { resolveViewerAccessFresh, type ViewerAccess } from "../members/viewer-access.ts";

/** A changed subscription re-reads the public subset before any slip snapshot leaves the response. */
export async function readWithSlipAccess<T>(read: (access: ViewerAccess) => Promise<T>, resolveAccess = resolveViewerAccessFresh): Promise<T> {
  const initial = await resolveAccess();
  let value = await read(initial);
  const final = await resolveAccess();
  if (initial.tier !== final.tier) {
    value = await read(final);
    if ((await resolveAccess()).tier !== final.tier) throw new Error("Slip access changed during the read.");
  }
  return value;
}
