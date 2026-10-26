import RealPage from "@/app/(owner)/analytics/page";
import { seed } from "../../fixture";

export const dynamic = "force-dynamic";
export { metadata } from "@/app/(owner)/analytics/page";
export default function Page() {
  seed();
  return <RealPage />;
}
