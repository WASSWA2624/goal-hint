import { redirectHomeQuery } from "@/server/seo/home-query";

export default async function RootPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectHomeQuery("en", await searchParams);
}
