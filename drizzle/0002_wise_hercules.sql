CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"central_dashboard_url" text,
	"central_api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
