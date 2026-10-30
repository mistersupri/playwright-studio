ALTER TABLE "artifacts" ADD COLUMN "folder" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "run_options" jsonb DEFAULT '{}'::jsonb NOT NULL;