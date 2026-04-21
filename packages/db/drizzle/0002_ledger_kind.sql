ALTER TABLE `tally_masters` ADD `ledger_kind` text;
--> statement-breakpoint
UPDATE `tally_masters` SET `ledger_kind` = 'OTHER' WHERE `type` = 'LEDGER' AND `ledger_kind` IS NULL;
