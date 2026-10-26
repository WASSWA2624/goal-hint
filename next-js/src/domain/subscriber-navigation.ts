import { memberReturnPath } from "./member-navigation.ts";

/** Every locked surface offers registration to guests and the payment flow to signed-in members. */
export function subscriberHref(signedIn: boolean, returnTo: unknown = "/en") {
  const query = new URLSearchParams();
  if (!signedIn) query.set("view", "register");
  const path = memberReturnPath(returnTo);
  if (path) query.set("return", path);
  return `/en/${signedIn ? "subscribe" : "account"}${query.size ? `?${query}` : ""}`;
}
