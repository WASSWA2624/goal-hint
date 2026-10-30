import { SampleBestSlips } from "../sample-page";
import { reviewViewer } from "../viewer-modes";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ viewer?: string }> }) {
  return <SampleBestSlips viewer={reviewViewer((await searchParams).viewer)} />;
}
