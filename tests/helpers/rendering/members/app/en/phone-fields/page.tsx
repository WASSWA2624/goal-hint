import { PublicShell } from "@/app/_components/public-shell";
import { PhoneFieldsProbe } from "./phone-fields-probe";

export default function PhoneFieldsPage() {
  return <PublicShell locale="en" showAccount><PhoneFieldsProbe /></PublicShell>;
}
