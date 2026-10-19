import AdminCodesPage from "@/app/admin/codes/page";
import {seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
export {metadata} from "@/app/admin/codes/page";
export default async function Page(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}){ seed(); return AdminCodesPage(props); }
