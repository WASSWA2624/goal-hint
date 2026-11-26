import RealPage from "@/app/(owner)/admin/password-requests/page";
import { seed } from "../../../fixture";

export { metadata } from "@/app/(owner)/admin/password-requests/page";
export const dynamic = "force-dynamic";

export default function Page(props: Parameters<typeof RealPage>[0]) {
  seed();
  return RealPage(props);
}
