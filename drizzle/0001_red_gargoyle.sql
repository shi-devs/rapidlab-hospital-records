CREATE TABLE `staff_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`staff_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_profiles_staff_id_unique` ON `staff_profiles` (`staff_id`);--> statement-breakpoint
ALTER TABLE `lab_records` ADD `owner_email` text;