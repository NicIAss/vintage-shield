import { listPublicBans, vintageStoryExport } from "@/lib/ban-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { bans } = await listPublicBans();
  const payload = JSON.stringify(vintageStoryExport(bans), null, 2);
  return new Response(payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="public-banlist.json"',
      "Cache-Control": "public, max-age=60",
    },
  });
}
