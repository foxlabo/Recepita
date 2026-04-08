export const runtime = "nodejs";

export async function GET() {
  return new Response(JSON.stringify({ ok: true, route: "/api/ping" }), {
    headers: { "content-type": "application/json" },
  });
}
