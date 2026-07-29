import {
  BanCaseRow,
  cleanText,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authError = requireBotAuth(request);
  if (authError) return authError;

  const db = await getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  const row = await db
    .prepare("SELECT * FROM ban_cases WHERE id = ?")
    .bind(id)
    .first<BanCaseRow>();
  if (!row) {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }

  const votes = await db
    .prepare(
      `SELECT voter_discord_id, voter_name, vote, note, created_at
       FROM case_votes WHERE case_id = ? ORDER BY created_at ASC`,
    )
    .bind(id)
    .all();

  return Response.json({ case: row, votes: votes.results ?? [] });
}

export async function PATCH(request: Request, context: RouteContext) {
  const authError = requireBotAuth(request);
  if (authError) return authError;

  const db = await getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  const payload = (await request.json()) as {
    discord_message_id?: string;
    revoke?: boolean;
    actor_discord_id?: string;
    actor_name?: string;
    reason?: string;
  };

  if (payload.discord_message_id) {
    const messageId = cleanText(payload.discord_message_id, 24);
    await db
      .prepare("UPDATE ban_cases SET discord_message_id = ? WHERE id = ?")
      .bind(messageId, id)
      .run();
    return Response.json({ ok: true, discord_message_id: messageId });
  }

  if (payload.revoke) {
    const current = await db
      .prepare("SELECT guild_id FROM ban_cases WHERE id = ?")
      .bind(id)
      .first<{ guild_id: string }>();
    if (!current) {
      return Response.json({ error: "Case not found" }, { status: 404 });
    }
    const now = new Date().toISOString();
    const actorId = cleanText(payload.actor_discord_id, 24);
    const actorName = cleanText(payload.actor_name, 100);
    const reason = cleanText(payload.reason, 500);
    await db.batch([
      db
        .prepare(
          "UPDATE ban_cases SET status = 'revoked', decided_at = ? WHERE id = ?",
        )
        .bind(now, id),
      db
        .prepare(
          `INSERT INTO audit_events (
            case_id, guild_id, actor_discord_id, actor_name, action, detail, created_at
          ) VALUES (?, ?, ?, ?, 'ban_revoked', ?, ?)`,
        )
        .bind(id, current.guild_id, actorId, actorName, reason, now),
    ]);
    return Response.json({ ok: true, status: "revoked" });
  }

  return Response.json({ error: "No supported update supplied" }, { status: 400 });
}
