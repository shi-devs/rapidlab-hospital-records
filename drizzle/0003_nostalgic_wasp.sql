CREATE TABLE `lab_report_files` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`hospital_id` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`uploaded_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lab_report_files_hospital_id` ON `lab_report_files` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `idx_lab_report_files_record_id` ON `lab_report_files` (`record_id`);