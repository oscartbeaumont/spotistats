ALTER TABLE `spotify_tracking_users` ADD `last_read_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `spotify_tracking_users` SET `last_read_at` = `consented_at` WHERE `last_read_at` = 0;
