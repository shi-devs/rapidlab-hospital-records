CREATE TABLE `hospital_members` (
	`email` text PRIMARY KEY NOT NULL,
	`hospital_id` text NOT NULL,
	`role` text DEFAULT 'nurse' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`joined_at` integer NOT NULL,
	`approved_at` integer,
	`approved_by_email` text
);
--> statement-breakpoint
CREATE TABLE `hospitals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hospitals_code_unique` ON `hospitals` (`code`);--> statement-breakpoint
CREATE TABLE `record_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text,
	`hospital_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `lab_records` ADD `hospital_id` text;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `created_by_email` text;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `assigned_to_email` text;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `verified_by_email` text;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `lab_records` ADD `updated_at` integer;