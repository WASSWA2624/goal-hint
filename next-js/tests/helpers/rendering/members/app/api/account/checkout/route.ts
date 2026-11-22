import { checkoutSelectionSchema } from "@/domain/checkout";
import { fixtureCheckoutQuote, fixtureCheckoutView } from "../../../fixture-checkout";
import { subscriptionScenarioFromHeaders } from "../../../fixture-subscription";

export function GET(request: Request) {
  return Response.json(fixtureCheckoutView(subscriptionScenarioFromHeaders(request.headers)));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const body: unknown = JSON.parse(String(form.get("payload") ?? "null"));
  if (!body || typeof body !== "object" || !("action" in body) || body.action !== "quote" || !("selection" in body))
    return Response.json({ message: "This acceptance fixture can only preview a quote." }, { status: 400 });
  const selection = checkoutSelectionSchema.safeParse(body.selection);
  const quote = selection.success ? fixtureCheckoutQuote(selection.data, subscriptionScenarioFromHeaders(request.headers)) : null;
  return quote ? Response.json(quote) : Response.json({ message: "Synthetic quote unavailable." }, { status: 400 });
}
