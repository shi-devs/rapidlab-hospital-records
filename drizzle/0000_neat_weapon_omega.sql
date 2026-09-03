CREATE TABLE `lab_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_code` text NOT NULL,
	`patient_name` text NOT NULL,
	`patient_age` integer,
	`source` text NOT NULL,
	`values_json` text NOT NULL,
	`report_file_key` text,
	`report_file_name` text,
	`created_at` integer NOT NULL
);
