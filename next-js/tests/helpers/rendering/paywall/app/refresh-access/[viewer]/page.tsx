import { notFound } from "next/navigation";
import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { readBestSnapshot } from "../../best";
import { accessFor, policy } from "../../stored";

export const dynamic = "force-dynamic";

/** Each request loses entitlement while the stored read is in flight. No mutable state crosses requests. */
export default async function Page({ params }: { params: Promise<{ viewer: string }> }) {
  const { viewer } = await params;
  if (!["anonymous", "expired"].includes(viewer)) notFound();
  let current = "entitled";
  const route = createBestSlipsRoute({ policy, access: async () => accessFor(current), read: async () => {
    const snapshot = await readBestSnapshot();
    current = viewer;
    return snapshot;
  } });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });
}
