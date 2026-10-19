import RealPage from "@/app/admin/audit/page";
import {seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
export {metadata} from "@/app/admin/audit/page";
export default async function Page(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}){seed();return RealPage(props);}
