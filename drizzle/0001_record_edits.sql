ALTER TABLE "records" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;