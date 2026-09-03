CREATE TABLE `workspace_archive_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`source_table` text NOT NULL,
	`source_key` text NOT NULL,
	`row_json` text NOT NULL,
	`archived_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_archive_rows_archive_id` ON `workspace_archive_rows` (`archive_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_archive_rows_source_table` ON `workspace_archive_rows` (`source_table`);--> statement-breakpoint
CREATE TABLE `workspace_reset_state` (
	`reset_id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`applied_at` integer NOT NULL
);
