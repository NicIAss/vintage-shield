import {
  clampDuration,
  cleanText,
  createCaseId,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";

type ReportPayload = {
  guild_id?: string;
  player_name?: string;
  player_uid?: string;
  public_reason?: string;
  evidence?: string;
  source_server?: string;
  reporter_name?: string;
  reporter_discord_id?: string;
  duration_days?: number;
  action_taken?: boolean;
};

export async function POST(request: Request) {
  const authError = requireBotAuth(request);
  if (authError) return authError;

  const db = getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const payload = (await request.json()) as ReportPayload;
  const guildId = cleanText(payload.guild_id, 24);
  const playerName = cleanText(payload.player_name, 64);
  const playerUid = cleanText(payload.player_uid, 128);
  const publicReason = cleanText(payload.public_reason, 500);
  const evidence = cleanText(payload.evidence, 2000);
  const sourceServer =
    cleanText(payload.source_server, 100) || "Community report";
  const reporterName = cleanText(payload.reporter_name, 100);
  const reporterId = cleanText(payload.reporter_discord_id, 24);

  if (
    !guildId ||
    !playerName ||
    !playerUid ||
    !publicReason ||
    !reporterName ||
    !reporterId
  ) {
    return Response.json(
      {
        error:
          "guild_id, player_name, player_uid, public_reason, reporter_name and reporter_discord_id are required",
      },
      { status: 400 },
    );
  }

  const duplicate = await db
    .prepare(
      `SELECT id, status FROM ban_cases
       WHERE player_uid = ? AND status IN ('pending', 'approved')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerUid)
    .first<{ id: string; status: string }>();

  if (duplicate) {
    return Response.json(
      {
        error: "A pending or approved case already exists for this player UID.",
        existing_case_id: duplicate.id,
        existing_status: duplicate.status,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const durationDays = clampDuration(payload.duration_days);
  const expiresAt = new Date(
    now.getTime() + durationDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const id = createCaseId();

  await db.batch([
    db
      .prepare(
        `INSERT INTO ban_cases (
          id, guild_id, player_name, player_uid, public_reason, evidence,
          source_server, reporter_name, reporter_discord_id, action_taken,
          status, duration_days, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(
        id,
        guildId,
        playerName,
        playerUid,
        publicReason,
        evidence,
        sourceServer,
        reporterName,
        reporterId,
        payload.action_taken ? 1 : 0,
        durationDays,
        now.toISOString(),
        expiresAt,
      ),
    db
      .prepare(
        `INSERT INTO audit_events (
          case_id, guild_id, actor_discord_id, actor_name, action, detail, created_at
        ) VALUES (?, ?, ?, ?, 'case_created', ?, ?)`,
      )
      .bind(
        id,
        guildId,
        reporterId,
        reporterName,
        payload.action_taken
          ? "Reported after a server ban was issued"
          : "Submitted for community review",
        now.toISOString(),
      ),
  ]);

  return Response.json(
    {
      case: {
        id,
        status: "pending",
        player_name: playerName,
        player_uid: playerUid,
        public_reason: publicReason,
        evidence,
        source_server: sourceServer,
        reporter_name: reporterName,
        action_taken: Boolean(payload.action_taken),
        duration_days: durationDays,
        created_at: now.toISOString(),
        expires_at: expiresAt,
      },
    },
    { status: 201 },
  );
}
