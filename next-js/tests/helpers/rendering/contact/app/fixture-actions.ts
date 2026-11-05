"use server";

import { revalidatePath } from "next/cache";

/** Fixture-only owner refresh: the production action keeps its real authorization guard. */
export async function refreshAdminData() { revalidatePath("/admin/settings"); }
