CREATE TABLE `tally_discovery` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`tally_company_name` text NOT NULL,
	`tally_company_remote_id` text NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tally_discovery_org_remote_id_unique` ON `tally_discovery` (`organization_id`,`tally_company_remote_id`);