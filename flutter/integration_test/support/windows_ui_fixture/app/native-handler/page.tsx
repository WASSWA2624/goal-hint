import { NativeFrame } from "../native-frame";

export const metadata = { title: "Goal Hint native external handler" };
export default function NativeHandler() {
  return <div data-native-ui-external><NativeFrame heading="Goal Hint native external handler">
    <p>The operating system opened this isolated loopback page in its registered browser.</p>
    <p>No account, message, upload or external service is used.</p>
  </NativeFrame></div>;
}
