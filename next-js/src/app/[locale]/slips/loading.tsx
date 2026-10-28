import { PageLoading } from "@/components/navigation/page-loading";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";

export default function Loading() {
  return <PageLoading label={createMessages(publicPolicy.defaultLocale).text("navigation.loading")} />;
}
