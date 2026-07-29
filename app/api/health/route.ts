export async function GET() {
  return Response.json({
    ok: true,
    service: "vintage-shield",
    time: new Date().toISOString(),
  });
}
