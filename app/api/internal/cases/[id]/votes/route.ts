import {
  BanCaseRow,
  cleanText,
  getDatabase,
  requireBotAuth,
} from "@/lib/ban-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authError = requireBotAuth(request);
  if (authError) return authError;

  const db = await getDatabase();
  if (!db) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  const payload = (await request.json()) as {
    voter_discord_id?: string;
    voter_name?: string;
    vote?: "confirm" | "deny";
    note?: string;
  };
  const voterId = cleanText(payload.voter_discord_id, 24);
  const voterName = cleanText(payload.voter_name, 100);
  const note = cleanText(payload.note, 500);
  if (!voterId || !voterName || !["confirm", "deny"].includes(payload.vote ?? "")) {
    return Response.json(
      { error: "voter_discord_id, voter_name and a valid vote are required" },
      { status: 400 },
    );
  }

  const row = await db
    .prepare("SELECT * FROM ban_cases WHERE id = ?")
    .bind(id)
    .first<BanCaseRow>();
  if (!row) {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return Response.json(
      { error: `Case is already ${row.status}`, status: row.status },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO case_votes (
        case_id, voter_discord_id, voter_name, vote, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(case_id, voter_discord_id) DO UPDATE SET
        voter_name = excluded.voter_name,
        vote = excluded.vote,
        note = excluded.note,
        created_at = excluded.created_at`,
    )
    .bind(id, voterId, voterName, payload.vote, note, now)
    .run();

  const counts = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN vote = 'confirm' THEN 1 ELSE 0 END) AS confirms,
        SUM(CASE WHEN vote = 'deny' THEN 1 ELSE 0 END) AS denials
       FROM case_votes WHERE case_id = ?`,
    )
    .bind(id)
    .first<{ confirms: number | null; denials: number | null }>();

  const settings = await db
    .prepare(
      `SELECT approval_threshold, denial_threshold
       FROM guild_settings WHERE guild_id = ?`,
    )
    .bind(row.guild_id)
    .first<{ approval_threshold: number; denial_threshold: number }>();

  const confirms = Number(counts?.confirms ?? 0);
  const denials = Number(counts?.denials ?? 0);
  const approvalThreshold = settings?.approval_threshold ?? 2;
  const denialThreshold = settings?.denial_threshold ?? 2;
  const nextStatus =
    confirms >= approvalThreshold
      ? "approved"
      : denials >= denialThreshold
        ? "denied"
        : "pending";

  const statements = [
    db
      .prepare(
        `INSERT INTO audit_events (
          case_id, guild_id, actor_discord_id, actor_name, action, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        row.guild_id,
        voterId,
        voterName,
        payload.vote === "confirm" ? "vote_confirmed" : "vote_denied",
        note,
        now,
      ),
  ];

  if (nextStatus !== "pending") {
    statements.push(
      db
        .prepare(
          "UPDATE ban_cases SET status = ?, decided_at = ? WHERE id = ?",
        )
        .bind(nextStatus, now, id),
      db
        .prepare(
          `INSERT INTO audit_events (
            case_id, guild_id, actor_discord_id, actor_name, action, detail, created_at
          ) VALUES (?, ?, 'system', 'Vintage Shield', ?, ?, ?)`,
        )
        .bind(
          id,
          row.guild_id,
          nextStatus === "approved" ? "case_approved" : "case_denied",
          `${confirms} confirmations, ${denials} denials`,
          now,
        ),
    );
  }
  await db.batch(statements);

  return Response.json({
    case_id: id,
    status: nextStatus,
    confirms,
    denials,
    approval_threshold: approvalThreshold,
    denial_threshold: denialThreshold,
  });
}
