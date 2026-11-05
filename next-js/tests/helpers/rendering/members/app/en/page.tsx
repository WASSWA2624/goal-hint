import { redirect } from "next/navigation";
import { memberHomePath } from "@/domain/member-navigation";
export default function Home() { redirect(memberHomePath); }
