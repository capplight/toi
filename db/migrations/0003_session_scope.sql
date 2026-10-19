CREATE TABLE "session_events" (
	"session_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "session_events_session_id_event_id_pk" PRIMARY KEY("session_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scope_check" CHECK ("sessions"."scope" in ('all','events'));