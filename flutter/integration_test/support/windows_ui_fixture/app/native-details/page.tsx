import { TextLink } from "@/components/ui/controls";
import { NativeFrame } from "../native-frame";

export default function NativeDetails() {
  return <div data-native-ui-detail><NativeFrame heading="Native internal detail">
    <p>This is an actual Next.js route. Use the native Alt+Left shortcut to return.</p>
    <TextLink href="/">Return to acceptance input</TextLink>
  </NativeFrame></div>;
}
