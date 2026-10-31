import { AccountAuthForm } from "@/components/members/account-auth-form";
import { memberReturnPath } from "@/domain/member-navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  return <AccountAuthForm locale="en" returnTo={memberReturnPath((await searchParams).return)} contact={{ contactPhone: null, whatsappPhone: null }} />;
}
