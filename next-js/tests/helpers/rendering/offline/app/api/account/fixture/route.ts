const headers = { "cache-control": "private, no-store", vary: "Cookie" };
export async function GET() {
  return Response.json({ phone: "synthetic-private-phone", prediction: "synthetic-protected-prediction" }, { headers });
}
export async function POST() {
  return Response.json({ synthetic: true }, { headers });
}
