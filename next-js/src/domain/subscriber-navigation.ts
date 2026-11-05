import { memberAuthPath, memberReturnPath } from "./member-navigation.ts";

/** Locked surfaces retain their return destination and can choose the guest's authentication form. */
export function subscriberHref(signedIn: boolean, returnTo: unknown = "/en", guestView: "login" | "register" = "register") {
  if (!signedIn) return memberAuthPath(guestView, returnTo);
  const query = new URLSearchParams();
  const path = memberReturnPath(returnTo);
  if (path) query.set("return", path);
  return `/en/subscribe${query.size ? `?${query}` : ""}`;
}
