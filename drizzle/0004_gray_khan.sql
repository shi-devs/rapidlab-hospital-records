CREATE TABLE `auth_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_email` ON `auth_sessions` (`email`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_expires_at` ON `auth_sessions` (`expires_at`);