import "server-only";

import type { JointSlipModel } from "../../domain/joint-slips.ts";

/** The web process binds no joint model until one is qualified on retained outcomes (S03/P01). A reviewed binding
 * must be the same model and verifier the publication worker uses; no fallback exists. */
export function boundJointSlipModel(): JointSlipModel | null {
  return null;
}
