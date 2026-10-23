import AdminPaymentsPage,{generateMetadata as paymentMetadata} from "@/app/admin/payments/page";
import {loadPaymentsFixture,seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
async function prepare(props:Props){const parameters=await props.searchParams;if(parameters.fixture==="review")loadPaymentsFixture();seed();}
export async function generateMetadata(props:Props){await prepare(props);return paymentMetadata(props);}
export default async function Page(props:Props){
  await prepare(props);return AdminPaymentsPage(props);
}
