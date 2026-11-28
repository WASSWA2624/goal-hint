import { memberAuthPath, memberNextPath } from "./member-navigation.ts";

/** Locked surfaces retain their return destination and can choose the guest's authentication form. */
export function subscriptionHref(signedIn: boolean, returnTo: unknown = "/en", guestView: "login" | "register" = "register") {
  return signedIn ? memberNextPath("subscribe", returnTo, undefined, true) : memberAuthPath(guestView, returnTo, true);
}
