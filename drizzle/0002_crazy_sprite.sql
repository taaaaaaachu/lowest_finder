PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`used_by` text,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invites`("id", "code", "created_by", "created_at", "expires_at", "used_by", "used_at") SELECT "id", "code", "created_by", "created_at", "expires_at", "used_by", "used_at" FROM `invites`;--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
ALTER TABLE `__new_invites` RENAME TO `invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invites_code_unique` ON `invites` (`code`);--> statement-breakpoint
CREATE INDEX `invites_creator_idx` ON `invites` (`created_by`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- 既存DBの移行: super_admin が居なければ最古参ユーザーを super_admin に昇格する(空DBなら何もしない)。
UPDATE `users` SET `role` = 'super_admin' WHERE `id` = (SELECT `id` FROM `users` ORDER BY `created_at` ASC, `id` ASC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM `users` WHERE `role` = 'super_admin');