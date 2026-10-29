import { adminRoute, readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";
import { fixtureSnapshot, loadNoticesFixture, loadPaymentsFixture, loadPaymentsQueueFixture, resetFixture, seed } from "../../../fixture";
seed();
export const GET = adminRoute(async () => json(fixtureSnapshot()));
export const POST = adminRoute(async ({ request }) => {
  const read = await readJsonBody(request);if ("refusal" in read) return read.refusal;
  if (![undefined, "baseline", "review", "queue", "notices"].includes(read.body.scenario as string | undefined)) return json({ message: "Choose a fixture scenario." }, 400);
  resetFixture();if (read.body.scenario === "review") loadPaymentsFixture();if (read.body.scenario === "queue") loadPaymentsQueueFixture();if (read.body.scenario === "notices") loadNoticesFixture();
  return json({ status: "reset" });
});
