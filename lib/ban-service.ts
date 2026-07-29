import {
  postgresDatabase,
  type Database,
} from "@/lib/database";

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
  durationDays: number;
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
  DATABASE_URL?: string;
  ADMIN_GUILD_ID?: string;
};

const demoCases: PublicBan[] = [
  {
    id: "VS-1842",
    playerName: "AshenRook",
    playerUid: "demo-uid-4c2f7d8a",
    reason: "Repeated griefing after multiple warnings",
    sourceServer: "Example Vintage Story Server",
    reporterName: "Community review",
    createdAt: "2026-07-24T18:20:00.000Z",
    expiresAt: "2036-07-22T18:20:00.000Z",
    durationDays: 3650,
    status: "approved",
    actionTaken: true,
    command: "/ban AshenRook 3650 days Repeated griefing after multiple warnings",
  },
  {
    id: "VS-1839",
    playerName: "CopperWraith",
    playerUid: "demo-uid-1a9e3f6b",
    reason: "Ban evasion after a confirmed inventory theft case",
    sourceServer: "Example Vintage Story Server",
    reporterName: "Community review",
    createdAt: "2026-07-21T11:05:00.000Z",
    expiresAt: "2036-07-19T11:05:00.000Z",
    durationDays: 3650,
    status: "approved",
    actionTaken: true,
    command: "/ban CopperWraith 3650 days Ban evasion after a confirmed inventory theft case",
  },
  {
    id: "VS-1827",
    playerName: "NightKiln",
    playerUid: "demo-uid-8b7d2c4e",
    reason: "Malicious use of an exploit affecting server stability",
    sourceServer: "Example Vintage Story Server",
    reporterName: "Community review",
    createdAt: "2026-07-15T09:45:00.000Z",
    expiresAt: "2036-07-13T09:45:00.000Z",
    durationDays: 3650,
    status: "approved",
    actionTaken: true,
    command: "/ban NightKiln 3650 days Malicious use of an exploit affecting server stability",
  },
  {
    id: "VS-1818",
    playerName: "FalseSpring",
    playerUid: "demo-uid-5e6a1d3c",
    reason: "Targeted harassment and repeated rule violations",
    sourceServer: "Example Vintage Story Server",
    reporterName: "Community review",
    createdAt: "2026-07-08T20:10:00.000Z",
    expiresAt: "2036-07-06T20:10:00.000Z",
    durationDays: 3650,
    status: "approved",
    actionTaken: false,
    command: "/ban FalseSpring 3650 days Targeted harassment and repeated rule violations",
  },
];

function appEnv(): AppEnv {
  const injected = (
    globalThis as typeof globalThis & {
      __VINTAGE_SHIELD_ENV__?: AppEnv;
    }
  ).__VINTAGE_SHIELD_ENV__;
  if (injected) return injected;
  if (typeof process !== "undefined") {
    return process.env as unknown as AppEnv;
  }
  return {};
}

export async function getDatabase(): Promise<Database | null> {
  const runtime = appEnv();
  if (runtime.DB) return runtime.DB as unknown as Database;
  if (runtime.DATABASE_URL) return postgresDatabase(runtime.DATABASE_URL);
  return null;
}

export function isDemoMode() {
  return appEnv().DEMO_MODE?.toLowerCase() === "true";
}

export function requireBotAuth(request: Request): Response | null {
  const runtime = appEnv();
  const expected = runtime.BOT_API_KEY;
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
  if (!runtime.ADMIN_GUILD_ID) {
    return Response.json(
      { error: "ADMIN_GUILD_ID is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("x-admin-guild-id") !== runtime.ADMIN_GUILD_ID) {
    return Response.json(
      { error: "This API only accepts the configured admin Discord server" },
      { status: 403 },
    );
  }
  return null;
}

export function toPublicBan(row: BanCaseRow): PublicBan {
  const command = `/ban ${row.player_name} ${row.duration_days} days ${row.public_reason}`;
  return {
    id: row.id,
    playerName: row.player_name,
    playerUid: row.player_uid,
    reason: row.public_reason,
    sourceServer: row.source_server,
    reporterName: row.reporter_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    durationDays: row.duration_days,
    status: "approved",
    actionTaken: Boolean(row.action_taken),
    command,
  };
}

export async function listPublicBans(): Promise<{
  bans: PublicBan[];
  demo: boolean;
}> {
  const db = await getDatabase();
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
    if (
      message.includes("no such table") ||
      message.includes("does not exist")
    ) {
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
