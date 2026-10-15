CREATE TABLE `dailies` (
	`project_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`day` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dailies_project_day` ON `dailies` (`project_id`,`day`);