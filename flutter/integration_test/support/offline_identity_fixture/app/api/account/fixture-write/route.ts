import { isSameOrigin, json } from "@/server/http/private-http";
import { attemptedWrite, state } from "../../../offline-identity";

export const dynamic = "force-dynamic";
export async function GET() { return json({ writeAttempts: (await state()).writeAttempts }); }
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  await attemptedWrite();
  return json({ synthetic: true });
}
