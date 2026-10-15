import "server-only";
import { resolveDiscoveryPolicy } from "../../domain/discovery.ts";
import { contactNotice } from "../../domain/contact-notice.ts";

/** Owner authorized production publication on 15 October 2026; see the deployment record. */
export const discoveryReleaseApproval = Object.freeze({ verified: true,
  evidenceRef: "docs/reports/seo-production-2026-10-15.md" });
export function getDiscoveryPolicy() {
  return resolveDiscoveryPolicy({ deployment: process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT, runtime: process.env.NODE_ENV,
    // Draft information pages retain their own noindex/publication controls.
    releaseVerified: discoveryReleaseApproval.verified && contactNotice.releaseReady });
}
