import { memberReturnPath } from "@/domain/member-navigation";
export async function POST(request: Request) {
  const target = memberReturnPath((await request.formData()).get("return")) ?? "/en";
  return new Response(null, { status: 303, headers: { Location: "/en/subscribe?" + new URLSearchParams({ return: target }), "Set-Cookie": "fixture-sharing-viewer=eligible; Path=/; HttpOnly; SameSite=Lax", "Cache-Control": "no-store" } });
}
