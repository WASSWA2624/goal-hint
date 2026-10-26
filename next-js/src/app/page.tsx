import { permanentRedirect } from "next/navigation";
import { homeHref } from "@/domain/navigation";

export default function RootPage() {
  permanentRedirect(homeHref());
}
