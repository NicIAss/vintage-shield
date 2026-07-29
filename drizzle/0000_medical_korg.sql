CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` text,
	`guild_id` text NOT NULL,
	`actor_discord_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ban_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`player_name` text NOT NULL,
	`player_uid` text NOT NULL,
	`public_reason` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`source_server` text DEFAULT 'Community report' NOT NULL,
	`reporter_name` text NOT NULL,
	`reporter_discord_id` text NOT NULL,
	`action_taken` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`duration_days` integer DEFAULT 3650 NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`expires_at` text NOT NULL,
	`discord_message_id` text
);
--> statement-breakpoint
CREATE TABLE `case_votes` (
	`case_id` text NOT NULL,
	`voter_discord_id` text NOT NULL,
	`voter_name` text NOT NULL,
	`vote` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `voter_discord_id`)
);
--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`guild_name` text DEFAULT 'Vintage Story Admin Community' NOT NULL,
	`review_channel_id` text,
	`log_channel_id` text,
	`notification_role_id` text,
	`reviewer_role_id` text,
	`approval_threshold` integer DEFAULT 2 NOT NULL,
	`denial_threshold` integer DEFAULT 2 NOT NULL,
	`public_server_name` text DEFAULT 'Community network' NOT NULL,
	`updated_at` text NOT NULL
);
