import AdminPlansPage from "@/app/admin/plans/page";
import {loadPaymentsFixture,seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
export {metadata} from "@/app/admin/plans/page";
type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
/** `?fixture=review` loads the three review plans; the default keeps the single acceptance plan. */
export default async function Page(props:Props){
  if((await props.searchParams).fixture==="review")loadPaymentsFixture();
  seed();return AdminPlansPage(props);
}
