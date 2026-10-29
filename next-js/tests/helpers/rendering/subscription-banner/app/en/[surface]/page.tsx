import { notFound } from "next/navigation";
import BannerFixture from "../matches/page";

/** Exercise real pathname-based banner hiding without importing account or payment services. */
export default async function BannerSurfaceFixture({ params, searchParams }: {
  params: Promise<{ surface: string }>; searchParams: Promise<{ state?: string }>;
}) {
  const { surface } = await params;
  if (surface !== "account" && surface !== "subscribe") notFound();
  return <BannerFixture searchParams={searchParams} />;
}

export const dynamic = "force-dynamic";
export { metadata } from "../matches/page";
