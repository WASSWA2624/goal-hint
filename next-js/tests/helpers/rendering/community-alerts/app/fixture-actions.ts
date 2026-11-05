"use server";

import { revalidatePath } from "next/cache";

/** Synthetic settings use the same refresh boundary without a real administrator session. */
export async function refreshAdminData(): Promise<void> {
  revalidatePath("/admin/settings");
}
