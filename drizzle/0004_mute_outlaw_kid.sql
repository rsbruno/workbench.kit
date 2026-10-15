ALTER TABLE `commits` ADD `branch_source` text;--> statement-breakpoint
ALTER TABLE `commits` ADD `branch` text;--> statement-breakpoint
ALTER TABLE `commits` DROP COLUMN `source_ref`;