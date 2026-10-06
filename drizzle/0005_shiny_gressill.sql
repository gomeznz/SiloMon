ALTER TABLE "silo_pages" ADD COLUMN "uid" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "silos" ADD COLUMN "uid" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "remote_config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_pages" ADD CONSTRAINT "silo_pages_uid_unique" UNIQUE("uid");--> statement-breakpoint
ALTER TABLE "silos" ADD CONSTRAINT "silos_uid_unique" UNIQUE("uid");