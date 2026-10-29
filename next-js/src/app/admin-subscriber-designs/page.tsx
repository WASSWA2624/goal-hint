import type { Metadata } from "next";
import { SubscriberDesignGallery } from "@/components/admin/subscribers-review/gallery";

export const metadata: Metadata = {
  title: "Subscriber interface samples · Goal Hint",
  description: "Compare ten subscriber workspaces with live search, compact summaries and dialog actions using fictional records.",
  robots: { index: false, follow: false },
};

export default function AdminSubscriberDesignsPage() {
  return <SubscriberDesignGallery />;
}
