import {
  BanCaseRow,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireBotAuth(request);
  if (authError) return authError;

  const db = await getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";
  const guildId = url.searchParams.get("guild_id");
  const allowed = new Set(["pending", "approved", "denied", "revoked"]);
  if (!allowed.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const statement = guildId
    ? db
        .prepare(
          `SELECT * FROM ban_cases
           WHERE status = ? AND guild_id = ?
           ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(status, guildId)
    : db
        .prepare(
          `SELECT * FROM ban_cases
           WHERE status = ?
           ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(status);

  const result = await statement.all<BanCaseRow>();
  return Response.json({ cases: result.results ?? [] });
}
