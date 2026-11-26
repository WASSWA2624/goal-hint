import ResetPasswordPage from "@/app/[locale]/account/reset-password/page";
export { metadata } from "@/app/[locale]/account/reset-password/page";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ResetPasswordPage params={Promise.resolve({ locale: "en" })} />;
}
