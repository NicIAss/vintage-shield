CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  guild_name TEXT NOT NULL DEFAULT 'Vintage Story Admin Community',
  review_channel_id TEXT,
  log_channel_id TEXT,
  notification_role_id TEXT,
  reviewer_role_id TEXT,
  approval_threshold INTEGER NOT NULL DEFAULT 2,
  denial_threshold INTEGER NOT NULL DEFAULT 2,
  public_server_name TEXT NOT NULL DEFAULT 'Vintage Story Server',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ban_cases (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_uid TEXT NOT NULL,
  public_reason TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  source_server TEXT NOT NULL DEFAULT 'Vintage Story Server',
  reporter_name TEXT NOT NULL,
  reporter_discord_id TEXT NOT NULL,
  action_taken INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
  duration_days INTEGER NOT NULL DEFAULT 3650,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  expires_at TEXT NOT NULL,
  discord_message_id TEXT
);

CREATE INDEX IF NOT EXISTS ban_cases_status_expiry_idx
  ON ban_cases (status, expires_at);
CREATE INDEX IF NOT EXISTS ban_cases_player_status_idx
  ON ban_cases (player_uid, status);
CREATE INDEX IF NOT EXISTS ban_cases_guild_status_idx
  ON ban_cases (guild_id, status);

CREATE TABLE IF NOT EXISTS case_votes (
  case_id TEXT NOT NULL,
  voter_discord_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'deny')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (case_id, voter_discord_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT,
  guild_id TEXT NOT NULL,
  actor_discord_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
