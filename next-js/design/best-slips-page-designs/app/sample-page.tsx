import { PublicShell } from "@/app/_components/public-shell";
import { BestSlips } from "@/components/slips/best-slips";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import { browseSamples, reviewDay } from "./review-data";
import type { ReviewViewer } from "./viewer-modes";

/** Same production page for the design gallery and the approved implementation preview. */
export function SampleBestSlips({ viewer }: { viewer: ReviewViewer }) {
  return <PublicShell locale="en" today={reviewDay} current="best-slips" app compact>
    <BestSlips locale="en" result={browseSamples(defaultBestSlipsQuery(viewer === "subscriber"), viewer)} signedIn={viewer !== "guest"} />
  </PublicShell>;
}
