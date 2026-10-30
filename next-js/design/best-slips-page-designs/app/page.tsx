import { ReviewGallery } from "./review-gallery";
import { reviewViewer } from "./viewer-modes";
import { SampleBestSlips } from "./sample-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ viewer?: string }> }) {
  const viewer = reviewViewer((await searchParams).viewer);
  return <ReviewGallery viewer={viewer}><SampleBestSlips viewer={viewer} /></ReviewGallery>;
}
