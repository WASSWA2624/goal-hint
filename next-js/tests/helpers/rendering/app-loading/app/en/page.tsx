import HomePage from "@/app/[locale]/page";

export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return HomePage({ ...props, params: Promise.resolve({ locale: "en" }) });
}
