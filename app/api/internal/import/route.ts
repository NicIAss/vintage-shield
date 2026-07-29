import {
  cleanText,
  createCaseId,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";
import type { DatabaseStatement } from "@/lib/database";

type ImportEntry = {
  PlayerUID?: string;
  PlayerName?: string;
  UntilDate?: string;
  Reason?: string;
  IssuedByPlayerName?: string;
};

export async function POST(request: Request) {
  const authError = requireBotAuth(request);
  if (authError) return authError;
  const db = await getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const payload = (await request.json()) as {
    guild_id?: string;
    actor_discord_id?: string;
    actor_name?: string;
    source_server?: string;
    entries?: ImportEntry[];
  };
  const guildId = cleanText(payload.guild_id, 24);
  const actorId = cleanText(payload.actor_discord_id, 24);
  const actorName = cleanText(payload.actor_name, 100);
  const sourceServer =
    cleanText(payload.source_server, 100) || "Imported ban list";
  if (!guildId || !actorId || !actorName || !Array.isArray(payload.entries)) {
    return Response.json({ error: "Invalid import payload" }, { status: 400 });
  }
  if (payload.entries.length > 500) {
    return Response.json(
      { error: "A single import is limited to 500 entries" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const statements: DatabaseStatement[] = [];
  let accepted = 0;
  for (const raw of payload.entries) {
    const playerUid = cleanText(raw.PlayerUID, 128);
    const playerName = cleanText(raw.PlayerName, 64);
    const reason = cleanText(raw.Reason, 500);
    if (!playerUid || !playerName || !reason) continue;

    const parsedUntil = new Date(String(raw.UntilDate ?? ""));
    const expiresAt = Number.isNaN(parsedUntil.getTime())
      ? new Date(Date.now() + 3650 * 86400000).toISOString()
      : parsedUntil.toISOString();
    const id = createCaseId();
    statements.push(
      db
        .prepare(
          "UPDATE ban_cases SET status = 'revoked', decided_at = ? WHERE player_uid = ? AND status = 'approved'",
        )
        .bind(now, playerUid),
      db
        .prepare(
          `INSERT INTO ban_cases (
            id, guild_id, player_name, player_uid, public_reason, evidence,
            source_server, reporter_name, reporter_discord_id, action_taken,
            status, duration_days, created_at, decided_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 1, 'approved', 3650, ?, ?, ?)`,
        )
        .bind(
          id,
          guildId,
          playerName,
          playerUid,
          reason,
          sourceServer,
          cleanText(raw.IssuedByPlayerName, 100) || actorName,
          actorId,
          now,
          now,
          expiresAt,
        ),
    );
    accepted += 1;
  }

  if (statements.length) {
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_events (
            case_id, guild_id, actor_discord_id, actor_name, action, detail, created_at
          ) VALUES (NULL, ?, ?, ?, 'banlist_imported', ?, ?)`,
        )
        .bind(
          guildId,
          actorId,
          actorName,
          `${accepted} entries imported`,
          now,
        ),
    );
    await db.batch(statements);
  }
  return Response.json({
    ok: true,
    accepted,
    skipped: payload.entries.length - accepted,
  });
}
