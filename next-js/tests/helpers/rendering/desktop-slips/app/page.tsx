import FixturePage from "./fixture-page";
export { metadata } from "./fixture-page";

export default function Page() {
  return <FixturePage params={Promise.resolve({ scenario: "desktop" })} />;
}
