import { listPublicBans } from "@/lib/ban-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listPublicBans();
    return Response.json(
      {
        ...result,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "The public ban list is temporarily unavailable." },
      { status: 503 },
    );
  }
}
