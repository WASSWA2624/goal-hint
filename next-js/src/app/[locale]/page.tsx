import { redirectHomeQuery } from "@/server/seo/home-query";

export default async function HomePage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  redirectHomeQuery(locale, query);
}
