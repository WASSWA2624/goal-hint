import "server-only";

import { androidAppLinkAssociation, iosAppLinkAssociation } from "../../domain/slip-app-links.ts";

type AssociationEnvironment = Readonly<{
  GOAL_HINT_ANDROID_APP_LINK_SHA256?: string | undefined;
  GOAL_HINT_IOS_APP_LINK_TEAM_ID?: string | undefined;
}>;

/** Association documents are public. Blank setup safely leaves website fallback. */
export function slipAppLinkResponse(platform: "android" | "ios", environment: AssociationEnvironment = {
  GOAL_HINT_ANDROID_APP_LINK_SHA256: process.env.GOAL_HINT_ANDROID_APP_LINK_SHA256,
  GOAL_HINT_IOS_APP_LINK_TEAM_ID: process.env.GOAL_HINT_IOS_APP_LINK_TEAM_ID,
}) {
  const association = platform === "android"
    ? androidAppLinkAssociation(environment.GOAL_HINT_ANDROID_APP_LINK_SHA256)
    : iosAppLinkAssociation(environment.GOAL_HINT_IOS_APP_LINK_TEAM_ID);
  return Response.json(association, { headers: {
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}
