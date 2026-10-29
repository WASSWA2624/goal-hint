import type { Metadata } from "next";
import { CodesDesignGallery } from "@/components/admin/codes-review/gallery";

export const metadata: Metadata = {
  title: "Codes interface samples · Goal Hint",
  description: "Compare ten admin Codes interface samples built from shared Goal Hint components and fictional data.",
  robots: { index: false, follow: false },
};

export default function AdminCodeDesignsPage() {
  return <CodesDesignGallery />;
}
