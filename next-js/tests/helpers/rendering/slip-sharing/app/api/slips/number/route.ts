const numbers = new Map<string, string>();
export async function POST(request: Request) {
  const { fingerprint, token } = await request.json();
  const identity = fingerprint ?? token;
  if (typeof identity !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{32})$/u.test(identity)) return Response.json({error:"invalid"},{status:400});
  if (!numbers.has(identity)) numbers.set(identity, String(numbers.size + 1).padStart(8, "0"));
  return Response.json({ number: numbers.get(identity), contacts: ["Support: +256700000082"] });
}
