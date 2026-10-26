import "server-only";

import { qualifiedJointModel, type JointSlipModel } from "../../domain/joint-slip-model.ts";

/** Trusted operator binding; references or request parameters cannot approve a model. */
export type SlipJointModelBinding = Readonly<{ model: JointSlipModel; verifyModel: (model: JointSlipModel) => boolean }>;
export function approvedSlipJointModel(binding: SlipJointModelBinding, at: number): boolean {
  try {
    if (!qualifiedJointModel(binding.model, at)) return false;
    const proof: unknown = binding.verifyModel(binding.model);
    if (proof instanceof Promise) void proof.catch(() => undefined);
    return proof === true;
  } catch { return false; }
}

/** The web process binds no joint model until one is qualified on retained outcomes (S03/P01). A reviewed binding
 * must be the same model and verifier the publication worker uses; no fallback exists. */
export function boundJointSlipModel(): SlipJointModelBinding | null {
  return null;
}
