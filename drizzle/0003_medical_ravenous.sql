CREATE TABLE `commits` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`is_breaking` integer DEFAULT false NOT NULL,
	`files_changed` integer DEFAULT 0 NOT NULL,
	`insertions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`committer_email` text NOT NULL,
	`committer_name` text NOT NULL,
	`committed_at` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`authored_at` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`pr_number` integer,
	`parent_hash` text,
	`co_authors` text,
	`source_ref` text,
	`tree_hash` text NOT NULL,
	`subject` text NOT NULL,
	`hash` text NOT NULL,
	`day` text NOT NULL,
	`ticket` text,
	`scope` text,
	`type` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commits_project_hash` ON `commits` (`project_id`,`hash`);--> statement-breakpoint
CREATE INDEX `commits_project_day` ON `commits` (`project_id`,`day`);