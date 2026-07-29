CREATE INDEX `ban_cases_status_expiry_idx` ON `ban_cases` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `ban_cases_player_status_idx` ON `ban_cases` (`player_uid`,`status`);--> statement-breakpoint
CREATE INDEX `ban_cases_guild_status_idx` ON `ban_cases` (`guild_id`,`status`);