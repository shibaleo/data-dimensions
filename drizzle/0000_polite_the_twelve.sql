CREATE SCHEMA "data_dimensions";
--> statement-breakpoint
CREATE TABLE "data_dimensions"."api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_dimensions"."mappings" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_value" text NOT NULL,
	"target_id" uuid NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"purged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mappings_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "data_dimensions"."services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_kind" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_dimensions"."target_masters" (
	"id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"deleted" boolean DEFAULT false NOT NULL,
	"purged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "target_masters_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE "data_dimensions"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"external_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_dimensions"."mappings" ADD CONSTRAINT "mappings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "data_dimensions"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_dimensions"."target_masters" ADD CONSTRAINT "target_masters_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "data_dimensions"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mappings_service_source_idx" ON "data_dimensions"."mappings" USING btree ("service_id","source_type","source_value","revision");--> statement-breakpoint
CREATE INDEX "mappings_service_target_idx" ON "data_dimensions"."mappings" USING btree ("service_id","target_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "services_code_key" ON "data_dimensions"."services" USING btree ("code");--> statement-breakpoint
CREATE INDEX "target_masters_service_id_idx" ON "data_dimensions"."target_masters" USING btree ("service_id","id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "data_dimensions"."user" USING btree ("email");