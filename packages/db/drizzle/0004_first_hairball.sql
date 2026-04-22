CREATE TABLE `pending_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`payload` text,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_syncs_company_idx` ON `pending_syncs` (`company_id`);--> statement-breakpoint
CREATE INDEX `pending_syncs_connector_idx` ON `pending_syncs` (`connector_id`);--> statement-breakpoint
CREATE INDEX `pending_syncs_status_idx` ON `pending_syncs` (`status`);
