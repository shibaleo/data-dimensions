CREATE TABLE "data_dimensions"."source_order" (
	"service_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_order_service_id_source_type_source_value_pk" PRIMARY KEY("service_id","source_type","source_value")
);
--> statement-breakpoint
CREATE TABLE "data_dimensions"."target_master_order" (
	"target_id" uuid PRIMARY KEY NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
