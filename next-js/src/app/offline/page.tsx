import type { Metadata } from "next";
import { OfflineView } from "@/components/offline/offline-view";

// No connection(), cookies(), account reads, or runtime analytics in this entry or its parent layout.
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Saved matches | Goal Hint", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <OfflineView />;
}
