import { PublicShell } from "@/app/_components/public-shell";
import { BestSlips } from "@/components/slips/best-slips";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import { ReviewGallery } from "./review-gallery";
import { browseSamples, reviewDay } from "./review-data";
import { reviewViewer } from "./viewer-modes";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ viewer?: string }> }) {
  const viewer = reviewViewer((await searchParams).viewer);
  return <ReviewGallery viewer={viewer}><PublicShell locale="en" today={reviewDay} current="best-slips" app compact>
    <BestSlips locale="en" result={browseSamples(defaultBestSlipsQuery(viewer === "subscriber"), viewer)} signedIn={viewer !== "guest"} />
  </PublicShell></ReviewGallery>;
}
