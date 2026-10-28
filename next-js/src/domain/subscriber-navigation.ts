import { memberReturnPath } from "./member-navigation.ts";

/** Locked surfaces retain their return destination and can choose the guest's authentication form. */
export function subscriberHref(signedIn: boolean, returnTo: unknown = "/en", guestView: "login" | "register" = "register") {
  const query = new URLSearchParams();
  if (!signedIn) query.set("view", guestView);
  const path = memberReturnPath(returnTo);
  if (path) query.set("return", path);
  return `/en/${signedIn ? "subscribe" : "account"}${query.size ? `?${query}` : ""}`;
}
