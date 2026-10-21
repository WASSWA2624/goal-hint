import RealPage from "@/app/admin/password-resets/page";
import { seed } from "../../fixture";
seed();
export const dynamic = "force-dynamic";
export { metadata } from "@/app/admin/password-resets/page";
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  seed();
  return RealPage(props);
}
