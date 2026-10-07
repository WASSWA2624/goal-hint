import { publicPolicy } from "@/domain/public-policy";

export default function HomePage() {
  return (
    <main>
      <h1>{publicPolicy.name}</h1>
      <p>Goal Hint is in development. Predictions are not yet available.</p>
    </main>
  );
}
