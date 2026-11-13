import { accountSectionHref } from "./account-navigation.ts";
import { memberAuthPath, memberReturnPath } from "./member-navigation.ts";

/** Locked surfaces lead to Subscriptions and retain the feature the visitor came from. */
export function subscriberHref(signedIn: boolean, returnTo: unknown = "/en", guestView: "login" | "register" = "register") {
  const subscriptions = accountSectionHref("en", "subscription", memberReturnPath(returnTo));
  return signedIn ? subscriptions : memberAuthPath(guestView, subscriptions);
}
