import { notFound } from "next/navigation";
import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { readBest } from "../../best";
import { accessFor, policy } from "../../stored";

export const dynamic = "force-dynamic";

/** Each request loses entitlement while the stored read is in flight. No mutable state crosses requests. */
export default async function Page({ params }: { params: Promise<{ viewer: string }> }) {
  const { viewer } = await params;
  if (!["anonymous", "expired"].includes(viewer)) notFound();
  let checks = 0;
  const route = createBestSlipsRoute({ read: readBest, policy,
    access: async () => accessFor(checks++ === 0 ? "entitled" : viewer) });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });
}
