import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const guildSettings = sqliteTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  guildName: text("guild_name").notNull().default("Vintage Story Admin Community"),
  reviewChannelId: text("review_channel_id"),
  logChannelId: text("log_channel_id"),
  notificationRoleId: text("notification_role_id"),
  reviewerRoleId: text("reviewer_role_id"),
  approvalThreshold: integer("approval_threshold").notNull().default(2),
  denialThreshold: integer("denial_threshold").notNull().default(2),
  publicServerName: text("public_server_name").notNull().default("Community network"),
  updatedAt: text("updated_at").notNull(),
});

export const banCases = sqliteTable(
  "ban_cases",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    playerName: text("player_name").notNull(),
    playerUid: text("player_uid").notNull(),
    publicReason: text("public_reason").notNull(),
    evidence: text("evidence").notNull().default(""),
    sourceServer: text("source_server").notNull().default("Community report"),
    reporterName: text("reporter_name").notNull(),
    reporterDiscordId: text("reporter_discord_id").notNull(),
    actionTaken: integer("action_taken", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", {
      enum: ["pending", "approved", "denied", "revoked"],
    })
      .notNull()
      .default("pending"),
    durationDays: integer("duration_days").notNull().default(3650),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
    expiresAt: text("expires_at").notNull(),
    discordMessageId: text("discord_message_id"),
  },
  (table) => [
    index("ban_cases_status_expiry_idx").on(table.status, table.expiresAt),
    index("ban_cases_player_status_idx").on(table.playerUid, table.status),
    index("ban_cases_guild_status_idx").on(table.guildId, table.status),
  ],
);

export const caseVotes = sqliteTable(
  "case_votes",
  {
    caseId: text("case_id").notNull(),
    voterDiscordId: text("voter_discord_id").notNull(),
    voterName: text("voter_name").notNull(),
    vote: text("vote", { enum: ["confirm", "deny"] }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.voterDiscordId] })],
);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: text("case_id"),
  guildId: text("guild_id").notNull(),
  actorDiscordId: text("actor_discord_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
