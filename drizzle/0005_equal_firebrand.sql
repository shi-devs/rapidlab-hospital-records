CREATE TABLE `email_verification_challenges` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`staff_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`code_hash` text NOT NULL,
	`code_salt` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`resend_after` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_verification_expires_at` ON `email_verification_challenges` (`expires_at`);