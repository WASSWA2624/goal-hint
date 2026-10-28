import { notFound } from "next/navigation";
import { createSlipsRoute } from "@/app/_components/slips-route";
import { now, syntheticBuild } from "../../stored";

/** Isolated account states exercise the real route without member or payment storage. */
export default async function Page({ params, searchParams }: {
  params: Promise<{ viewer: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { viewer } = await params;
  if (!["guest", "member", "subscriber"].includes(viewer)) notFound();
  const full = viewer === "subscriber";
  const route = createSlipsRoute({
    resolveAccess: async () => ({ tier: full ? "full" : "free", signedIn: viewer !== "guest", mode: "free" }),
    instant: async () => now,
    completionInstant: () => now,
    read: async (criteria) => {
      if (!full) throw new Error("A locked Slip Builder must not read match data.");
      return syntheticBuild(criteria);
    },
  });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
