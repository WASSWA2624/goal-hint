import "server-only";

import { redirect } from "next/navigation";
import { memberLoginPath } from "@/domain/member-navigation";

/** Private pages use the same phone/password sign-in screen as every other account. */
export function redirectToAccountLogin(): never {
  redirect(memberLoginPath);
}
