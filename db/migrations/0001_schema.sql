CREATE TYPE "public"."answer_source" AS ENUM('guest', 'member');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('kyz_uzatu', 'uilenu_toi', 'sundet', 'besik', 'merey', 'other');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('kk', 'ru');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('music', 'cover');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_kind" AS ENUM('parent', 'couple', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'yes', 'no');--> statement-breakpoint
CREATE TYPE "public"."seating_action" AS ENUM('auto_place', 'move', 'unlock', 'reorder', 'hall', 'full_reseat', 'unseat', 'answer', 'undo');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"family_id" uuid,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "allowed_owners" (
	"phone" text PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_owners_phone_check" CHECK ("allowed_owners"."phone" ~ '^\+7\d{10}$')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text,
	"label_kk" text NOT NULL,
	"label_ru" text,
	"seating_rank" smallint NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"color_token" text DEFAULT 'cat-8' NOT NULL,
	CONSTRAINT "categories_event_label_kk_key" UNIQUE("event_id","label_kk"),
	CONSTRAINT "categories_label_kk_check" CHECK (length("categories"."label_kk") between 1 and 40),
	CONSTRAINT "categories_label_ru_check" CHECK (length("categories"."label_ru") <= 40)
);
--> statement-breakpoint
CREATE TABLE "door_checkins" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"arrived" boolean NOT NULL,
	"client_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_reviews" (
	"event_id" uuid NOT NULL,
	"family_a" uuid NOT NULL,
	"family_b" uuid NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_reviews_event_id_family_a_family_b_pk" PRIMARY KEY("event_id","family_a","family_b"),
	CONSTRAINT "duplicate_reviews_order_check" CHECK ("duplicate_reviews"."family_a" < "duplicate_reviews"."family_b")
);
--> statement-breakpoint
CREATE TABLE "event_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"phone" text NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"can_edit_seating" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"member_kind" "member_kind" DEFAULT 'other' NOT NULL,
	"can_manage_budget" boolean DEFAULT false NOT NULL,
	"default_category_id" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "event_members_event_phone_key" UNIQUE("event_id","phone"),
	CONSTRAINT "event_members_phone_check" CHECK ("event_members"."phone" ~ '^\+7\d{10}$'),
	CONSTRAINT "event_members_label_check" CHECK (length("event_members"."label") <= 30)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "event_kind" NOT NULL,
	"title" text NOT NULL,
	"hosts_line" text,
	"starts_on" date NOT NULL,
	"starts_at" time,
	"tz" text DEFAULT 'Asia/Almaty' NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"map_url" text,
	"invitation_text_kk" text,
	"invitation_text_ru" text,
	"default_locale" "locale" DEFAULT 'kk' NOT NULL,
	"template_id" text DEFAULT 'classic' NOT NULL,
	"cover_asset_id" uuid,
	"music_asset_id" uuid,
	"hall_columns" smallint,
	"tables_count" smallint,
	"seats_per_table" smallint DEFAULT 12 NOT NULL,
	"price_per_seat" bigint,
	"budget_total" bigint,
	"door_token" text NOT NULL,
	"rsvp_closes_at" timestamp with time zone,
	"seating_version" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purge_after" date,
	CONSTRAINT "events_door_token_unique" UNIQUE("door_token"),
	CONSTRAINT "events_title_check" CHECK (length("events"."title") between 1 and 120),
	CONSTRAINT "events_hosts_line_check" CHECK (length("events"."hosts_line") <= 120),
	CONSTRAINT "events_map_url_check" CHECK ("events"."map_url" ~ '^https://'),
	CONSTRAINT "events_inv_kk_check" CHECK (length("events"."invitation_text_kk") <= 2000),
	CONSTRAINT "events_inv_ru_check" CHECK (length("events"."invitation_text_ru") <= 2000),
	CONSTRAINT "events_hall_columns_check" CHECK ("events"."hall_columns" in (2,4)),
	CONSTRAINT "events_tables_count_check" CHECK ("events"."tables_count" between 1 and 60),
	CONSTRAINT "events_seats_per_table_check" CHECK ("events"."seats_per_table" between 6 and 16),
	CONSTRAINT "events_price_check" CHECK ("events"."price_per_seat" >= 0),
	CONSTRAINT "events_budget_check" CHECK ("events"."budget_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"planned_amount" bigint DEFAULT 0 NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"due_date" date,
	"note" text,
	"linked_to_seats" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_category_check" CHECK ("expenses"."category" in ('restaurant','asaba','clothes','gifts','decor','photo','transport','other')),
	CONSTRAINT "expenses_title_check" CHECK (length("expenses"."title") between 1 and 80),
	CONSTRAINT "expenses_planned_check" CHECK ("expenses"."planned_amount" >= 0),
	CONSTRAINT "expenses_paid_check" CHECK ("expenses"."paid_amount" >= 0),
	CONSTRAINT "expenses_note_check" CHECK (length("expenses"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"added_by_member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"category_id" uuid NOT NULL,
	"expected_count" smallint NOT NULL,
	"rsvp" "rsvp_status" DEFAULT 'pending' NOT NULL,
	"confirmed_count" smallint,
	"responded_at" timestamp with time zone,
	"answered_by" "answer_source",
	"answered_by_member_id" uuid,
	"table_no" smallint,
	"seat_locked" boolean DEFAULT false NOT NULL,
	"locked_by_member_id" uuid,
	"seat_seq" integer DEFAULT 0 NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"table_sent_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"rsvp_consent_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "families_token_unique" UNIQUE("token"),
	CONSTRAINT "families_name_check" CHECK (length("families"."name") between 1 and 80),
	CONSTRAINT "families_phone_check" CHECK ("families"."phone" ~ '^\+7\d{10}$'),
	CONSTRAINT "families_expected_check" CHECK ("families"."expected_count" between 1 and 20),
	CONSTRAINT "families_confirmed_check" CHECK ("families"."confirmed_count" between 1 and 20),
	CONSTRAINT "families_yes_confirmed_check" CHECK ("families"."rsvp" <> 'yes' or "families"."confirmed_count" is not null),
	CONSTRAINT "families_lock_check" CHECK ("families"."table_no" is not null or "families"."seat_locked" = false)
);
--> statement-breakpoint
CREATE TABLE "hall_tables" (
	"event_id" uuid NOT NULL,
	"no" smallint NOT NULL,
	"capacity" smallint NOT NULL,
	CONSTRAINT "hall_tables_event_id_no_pk" PRIMARY KEY("event_id","no"),
	CONSTRAINT "hall_tables_no_check" CHECK ("hall_tables"."no" >= 1),
	CONSTRAINT "hall_tables_capacity_check" CHECK ("hall_tables"."capacity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "login_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"member_id" uuid,
	"purpose" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_session_id" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "login_links_phone_check" CHECK ("login_links"."phone" ~ '^\+7\d{10}$'),
	CONSTRAINT "login_links_purpose_check" CHECK ("login_links"."purpose" in ('member','owner_bootstrap'))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_s" smallint,
	"status" "media_status" DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_bytes_check" CHECK ("media_assets"."bytes" > 0 and "media_assets"."bytes" <= 20000000)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" "inet",
	"provider" text NOT NULL,
	"provider_msg_id" text,
	CONSTRAINT "otp_attempts_check" CHECK ("otp_challenges"."attempts" <= 5)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "seating_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_member_id" uuid,
	"action" "seating_action" NOT NULL,
	"summary" jsonb NOT NULL,
	"diff" jsonb NOT NULL,
	"seating_version_after" integer NOT NULL,
	"revert_of" bigint,
	"reverted_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seating_changes_actor_check" CHECK ("seating_changes"."actor_kind" in ('member','guest','system'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"auth_method" text NOT NULL,
	"device_label" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_auth_method_check" CHECK ("sessions"."auth_method" in ('link','sms'))
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_masked" text NOT NULL,
	"provider" text NOT NULL,
	"provider_msg_id" text,
	"status" text NOT NULL,
	"cost_tiyn" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"locale" "locale" DEFAULT 'kk' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_phone_check" CHECK ("users"."phone" ~ '^\+7\d{10}$'),
	CONSTRAINT "users_name_check" CHECK (length("users"."name") <= 60)
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_checkins" ADD CONSTRAINT "door_checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_checkins" ADD CONSTRAINT "door_checkins_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_family_a_families_id_fk" FOREIGN KEY ("family_a") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_family_b_families_id_fk" FOREIGN KEY ("family_b") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_decided_by_event_members_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_music_asset_id_media_assets_id_fk" FOREIGN KEY ("music_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_event_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_event_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_added_by_member_id_event_members_id_fk" FOREIGN KEY ("added_by_member_id") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_answered_by_member_id_event_members_id_fk" FOREIGN KEY ("answered_by_member_id") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_locked_by_member_id_event_members_id_fk" FOREIGN KEY ("locked_by_member_id") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_event_table_fk" FOREIGN KEY ("event_id","table_no") REFERENCES "public"."hall_tables"("event_id","no") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_tables" ADD CONSTRAINT "hall_tables_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_member_id_event_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."event_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_used_session_id_sessions_id_fk" FOREIGN KEY ("used_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_changes" ADD CONSTRAINT "seating_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_changes" ADD CONSTRAINT "seating_changes_actor_member_id_event_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."event_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_changes" ADD CONSTRAINT "seating_changes_revert_of_seating_changes_id_fk" FOREIGN KEY ("revert_of") REFERENCES "public"."seating_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_changes" ADD CONSTRAINT "seating_changes_reverted_by_seating_changes_id_fk" FOREIGN KEY ("reverted_by") REFERENCES "public"."seating_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_event_idx" ON "activity_log" USING btree ("event_id","kind","at");--> statement-breakpoint
CREATE INDEX "door_checkins_family_idx" ON "door_checkins" USING btree ("family_id","client_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "one_owner_per_event" ON "event_members" USING btree ("event_id") WHERE "event_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "event_members" USING btree ("user_id") WHERE "event_members"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "expenses_event_idx" ON "expenses" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "families_phone_uniq" ON "families" USING btree ("event_id","phone") WHERE "families"."phone" is not null and "families"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "families_event_idx" ON "families" USING btree ("event_id") WHERE "families"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "families_table_idx" ON "families" USING btree ("event_id","table_no") WHERE "families"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "families_member_idx" ON "families" USING btree ("event_id","added_by_member_id") WHERE "families"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "login_links_member_idx" ON "login_links" USING btree ("member_id") WHERE "login_links"."used_at" is null and "login_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "seating_changes_event_idx" ON "seating_changes" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" is null;