import { AccountRoute } from "@/app/_components/account-route";
import { createMessages } from "@/i18n/messages";
import { pageMetadata } from "@/server/seo/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => {
  const messages = createMessages();
  return pageMetadata({ title: messages.text("account.title"), description: messages.text("account.description"), path: "/en/account" });
};

export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AccountRoute locale={(await params).locale} searchParams={searchParams} />;
}
