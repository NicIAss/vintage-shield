import {
  cleanText,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";

type RouteContext = { params: Promise<{ guildId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authError = requireBotAuth(request);
  if (authError) return authError;
  const db = getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
  const { guildId } = await context.params;
  const row = await db
    .prepare("SELECT * FROM guild_settings WHERE guild_id = ?")
    .bind(guildId)
    .first();
  return Response.json({
    settings: row ?? {
      guild_id: guildId,
      approval_threshold: 2,
      denial_threshold: 2,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const authError = requireBotAuth(request);
  if (authError) return authError;
  const db = getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
  const { guildId } = await context.params;
  const payload = (await request.json()) as Record<string, unknown>;
  const threshold = (value: unknown) =>
    Math.max(1, Math.min(10, Math.round(Number(value) || 2)));
  const now = new Date().toISOString();
  const values = {
    guildName:
      cleanText(payload.guild_name, 100) || "Vintage Story Admin Community",
    reviewChannelId: cleanText(payload.review_channel_id, 24),
    logChannelId: cleanText(payload.log_channel_id, 24),
    notificationRoleId: cleanText(payload.notification_role_id, 24),
    reviewerRoleId: cleanText(payload.reviewer_role_id, 24),
    approvalThreshold: threshold(payload.approval_threshold),
    denialThreshold: threshold(payload.denial_threshold),
    publicServerName:
      cleanText(payload.public_server_name, 100) || "Community network",
  };

  await db
    .prepare(
      `INSERT INTO guild_settings (
        guild_id, guild_name, review_channel_id, log_channel_id,
        notification_role_id, reviewer_role_id, approval_threshold,
        denial_threshold, public_server_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        guild_name = excluded.guild_name,
        review_channel_id = excluded.review_channel_id,
        log_channel_id = excluded.log_channel_id,
        notification_role_id = excluded.notification_role_id,
        reviewer_role_id = excluded.reviewer_role_id,
        approval_threshold = excluded.approval_threshold,
        denial_threshold = excluded.denial_threshold,
        public_server_name = excluded.public_server_name,
        updated_at = excluded.updated_at`,
    )
    .bind(
      guildId,
      values.guildName,
      values.reviewChannelId || null,
      values.logChannelId || null,
      values.notificationRoleId || null,
      values.reviewerRoleId || null,
      values.approvalThreshold,
      values.denialThreshold,
      values.publicServerName,
      now,
    )
    .run();

  return Response.json({ ok: true, settings: values });
}
