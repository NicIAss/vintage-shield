import { env } from "cloudflare:workers";

export type CaseStatus = "pending" | "approved" | "denied" | "revoked";

export type PublicBan = {
  id: string;
  playerName: string;
  playerUid: string;
  reason: string;
  sourceServer: string;
  reporterName: string;
  createdAt: string;
  expiresAt: string;
  status: "approved";
  actionTaken: boolean;
  command: string;
};

export type BanCaseRow = {
  id: string;
  guild_id: string;
  player_name: string;
  player_uid: string;
  public_reason: string;
  evidence: string;
  source_server: string;
  reporter_name: string;
  reporter_discord_id: string;
  action_taken: number;
  status: CaseStatus;
  duration_days: number;
  created_at: string;
  decided_at: string | null;
  expires_at: string;
  discord_message_id: string | null;
};

type AppEnv = {
  DB?: D1Database;
  BOT_API_KEY?: string;
  DEMO_MODE?: string;
};

const demoCases: PublicBan[] = [
  {
    id: "VS-1842",
    playerName: "AshenRook",
    playerUid: "demo-uid-4c2f7d8a",
    reason: "Repeated griefing across multiple community servers",
    sourceServer: "Hearthlands",
    reporterName: "Community review",
    createdAt: "2026-07-24T18:20:00.000Z",
    expiresAt: "2036-07-22T18:20:00.000Z",
    status: "approved",
    actionTaken: true,
    command: "/ban AshenRook Repeated griefing across multiple community servers",
  },
  {
    id: "VS-1839",
    playerName: "CopperWraith",
    playerUid: "demo-uid-1a9e3f6b",
    reason: "Ban evasion after a confirmed inventory theft case",
    sourceServer: "Stone & Soil",
    reporterName: "Community review",
    createdAt: "2026-07-21T11:05:00.000Z",
    expiresAt: "2036-07-19T11:05:00.000Z",
    status: "approved",
    actionTaken: true,
    command: "/ban CopperWraith Ban evasion after a confirmed inventory theft case",
  },
  {
    id: "VS-1827",
    playerName: "NightKiln",
    playerUid: "demo-uid-8b7d2c4e",
    reason: "Malicious use of an exploit affecting server stability",
    sourceServer: "The Last Outpost",
    reporterName: "Community review",
    createdAt: "2026-07-15T09:45:00.000Z",
    expiresAt: "2036-07-13T09:45:00.000Z",
    status: "approved",
    actionTaken: true,
    command: "/ban NightKiln Malicious use of an exploit affecting server stability",
  },
  {
    id: "VS-1818",
    playerName: "FalseSpring",
    playerUid: "demo-uid-5e6a1d3c",
    reason: "Targeted harassment and repeated rule violations",
    sourceServer: "Lantern Vale",
    reporterName: "Community review",
    createdAt: "2026-07-08T20:10:00.000Z",
    expiresAt: "2036-07-06T20:10:00.000Z",
    status: "approved",
    actionTaken: false,
    command: "/ban FalseSpring Targeted harassment and repeated rule violations",
  },
];

function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}

export function getDatabase(): D1Database | null {
  return appEnv().DB ?? null;
}

export function isDemoMode() {
  return appEnv().DEMO_MODE?.toLowerCase() === "true";
}

export function requireBotAuth(request: Request): Response | null {
  const expected = appEnv().BOT_API_KEY;
  if (!expected) {
    return Response.json(
      { error: "BOT_API_KEY is not configured" },
      { status: 503 },
    );
  }
  const supplied = request.headers.get("x-api-key");
  if (supplied !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function toPublicBan(row: BanCaseRow): PublicBan {
  const command = `/ban ${row.player_name} ${row.public_reason}`;
  return {
    id: row.id,
    playerName: row.player_name,
    playerUid: row.player_uid,
    reason: row.public_reason,
    sourceServer: row.source_server,
    reporterName: row.reporter_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: "approved",
    actionTaken: Boolean(row.action_taken),
    command,
  };
}

export async function listPublicBans(): Promise<{
  bans: PublicBan[];
  demo: boolean;
}> {
  const db = getDatabase();
  if (!db || isDemoMode()) {
    return { bans: demoCases, demo: true };
  }

  try {
    const result = await db
      .prepare(
        `SELECT * FROM ban_cases
         WHERE status = 'approved' AND expires_at > ?
         ORDER BY decided_at DESC, created_at DESC`,
      )
      .bind(new Date().toISOString())
      .all<BanCaseRow>();
    return {
      bans: (result.results ?? []).map(toPublicBan),
      demo: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no such table")) {
      return { bans: demoCases, demo: true };
    }
    throw error;
  }
}

export function vintageStoryExport(bans: PublicBan[]) {
  return bans.map((ban) => ({
    PlayerUID: ban.playerUid,
    PlayerName: ban.playerName,
    UntilDate: ban.expiresAt,
    Reason: ban.reason,
    IssuedByPlayerName: "Vintage Shield Community Review",
  }));
}

export function createCaseId() {
  return `VS-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

export function clampDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 3650;
  return Math.max(1, Math.min(36500, Math.round(duration)));
}

export function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}
