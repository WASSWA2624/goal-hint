import "server-only";
import { resolveDiscoveryPolicy } from "../../domain/discovery.ts";
import { privacyNotice } from "../../domain/privacy-notice.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import { contactNotice } from "../../domain/contact-notice.ts";

/** 048–049 own actual verified release approval. No environment string grants it. */
export const discoveryReleaseApproval = Object.freeze({ verified: false, evidenceRef: null });
export function getDiscoveryPolicy() {
  return resolveDiscoveryPolicy({ deployment: process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT, runtime: process.env.NODE_ENV,
    releaseVerified: discoveryReleaseApproval.verified && privacyNotice.releaseReady && termsNotice.releaseReady && contactNotice.releaseReady });
}
