import AdminPaymentsPage from "@/app/admin/payments/page";
import {seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
export {generateMetadata} from "@/app/admin/payments/page";
export default async function Page(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}){ seed(); return AdminPaymentsPage(props); }
