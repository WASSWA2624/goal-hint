import { cookies } from "next/headers";
import Account, { metadata } from "@/../tests/helpers/rendering/members/app/en/account/page";
import { memberCookieName } from "@/server/members/member-sessions";

export { metadata };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await cookies()).get(memberCookieName(false))?.value;
  const state = token === "f".repeat(43) ? "active" : token === "expired" ? "ended" : "signed-out";
  return <Account searchParams={Promise.resolve({ ...await searchParams, state })} />;
}
