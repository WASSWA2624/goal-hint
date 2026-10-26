"use server";

import { revalidatePath } from "next/cache";
import { adminPageGate } from "@/server/admin/admin-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";

/** Refresh authorized owner data and history entries without a navigation fallback on transport failure. */
export async function refreshAdminData(): Promise<void> {
  const page = await adminPageGate();
  if (!page.owner) redirectToAccountLogin();
  revalidatePath("/(owner)", "layout");
}
