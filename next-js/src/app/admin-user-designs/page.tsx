import type { Metadata } from "next";
import { UserDesignGallery } from "@/components/admin/users-review/gallery";

export const metadata: Metadata = {
  title: "User interface samples · Goal Hint",
  description: "Compare ten user workspaces with live search, compact summaries and dialog actions using fictional records.",
  robots: { index: false, follow: false },
};

export default function AdminUserDesignsPage() {
  return <UserDesignGallery />;
}
