CREATE TYPE "public"."silo_register_data_type" AS ENUM('UINT16', 'INT16', 'UINT32', 'INT32', 'FLOAT32');--> statement-breakpoint
CREATE TABLE "silo_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "silo_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "silo_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"silo_id" integer NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silos" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 502 NOT NULL,
	"unit_id" integer DEFAULT 1 NOT NULL,
	"register_address" integer NOT NULL,
	"data_type" "silo_register_data_type" DEFAULT 'UINT16' NOT NULL,
	"scale" numeric(10, 4) DEFAULT '1' NOT NULL,
	"capacity" numeric(12, 2) NOT NULL,
	"unit" text DEFAULT 't' NOT NULL,
	"low_alarm_percent" numeric(4, 3),
	"high_alarm_percent" numeric(4, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"current_value" numeric(12, 2),
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "silo_readings" ADD CONSTRAINT "silo_readings_silo_id_silos_id_fk" FOREIGN KEY ("silo_id") REFERENCES "public"."silos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silos" ADD CONSTRAINT "silos_page_id_silo_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."silo_pages"("id") ON DELETE cascade ON UPDATE no action;