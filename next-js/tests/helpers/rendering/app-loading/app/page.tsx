import { PublicShell } from "@/app/_components/public-shell";
import { ButtonLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { DateInputGallery } from "./date-input-gallery";

export default function Page() {
  return <PublicShell locale="en"><Stack>
    <p>Synthetic loading acceptance fixture.</p>
    <DateInputGallery />
    <ButtonLink href="/en/matches" prefetch={false}>Matches</ButtonLink>
    <ButtonLink href="/en/performance" prefetch={false}>Performance</ButtonLink>
  </Stack></PublicShell>;
}
