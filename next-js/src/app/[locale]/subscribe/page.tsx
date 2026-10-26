import { SubscribeRoute } from "@/app/_components/subscribe-route";
import { createMessages } from "@/i18n/messages";
import { pageMetadata } from "@/server/seo/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => {
  const messages = createMessages();
  return pageMetadata({ title: messages.text("subscribe.title"), description: messages.text("subscribe.description"), path: "/en/subscribe" });
};
export default async function SubscribePage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SubscribeRoute locale={(await params).locale} searchParams={searchParams} />;
}
