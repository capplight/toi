/**
 * Database schema — plan section 5 (v1.4). Plain PostgreSQL 16+, no vendor extensions (plan 4.4).
 * Money: integer tenge (bigint). Time: timestamptz. Phones: E.164 `+7XXXXXXXXXX`.
 *
 * Two constraints Drizzle cannot express are added by hand in the migration (see db/migrations):
 * - `families (event_id, table_no) → hall_tables on delete set null (table_no)` (PG15+ column list);
 * - `categories unique (event_id, seating_rank) deferrable initially deferred`.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true });
const now = () => sql`now()`;
const PHONE_RE = sql.raw(`'^\\+7\\d{10}$'`);

export const localeEnum = pgEnum("locale", ["kk", "ru"]);
export const eventKindEnum = pgEnum("event_kind", ["kyz_uzatu", "uilenu_toi", "sundet", "besik", "merey", "other"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "editor"]);
export const memberKindEnum = pgEnum("member_kind", ["parent", "couple", "other"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["pending", "yes", "no"]);
export const answerSourceEnum = pgEnum("answer_source", ["guest", "member"]);
export const seatingActionEnum = pgEnum("seating_action", [
  "auto_place",
  "move",
  "unlock",
  "reorder",
  "hall",
  "full_reseat",
  "unseat",
  "answer",
  "undo",
]);
export const mediaKindEnum = pgEnum("media_kind", ["music", "cover"]);
export const mediaStatusEnum = pgEnum("media_status", ["uploaded", "processing", "ready", "failed"]);

// ---------- users, sessions, login ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull().unique(),
    name: text("name"),
    locale: localeEnum("locale").notNull().default("kk"),
    createdAt: tstz("created_at").notNull().default(now()),
    lastLoginAt: tstz("last_login_at"),
  },
  (t) => [
    check("users_phone_check", sql`${t.phone} ~ ${PHONE_RE}`),
    check("users_name_check", sql`length(${t.name}) <= 60`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) hex; the token itself lives only in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().default(now()),
    expiresAt: tstz("expires_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull().default(now()),
    authMethod: text("auth_method").notNull(),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    revokedAt: tstz("revoked_at"),
    /**
     * Access area (plan 6.1 v1.5, Ф2 review Б1): 'all' — SMS code or the founder's owner link (the phone is
     * proven); 'events' — a member's login link (only the events listed in session_events).
     */
    scope: text("scope").notNull().default("all"),
  },
  (t) => [
    check("sessions_auth_method_check", sql`${t.authMethod} in ('link','sms')`),
    check("sessions_scope_check", sql`${t.scope} in ('all','events')`),
    index("sessions_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/** Events a session with scope = 'events' may access (plan 5 v1.5). */
export const sessionEvents = pgTable(
  "session_events",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references((): AnyPgColumn => events.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.eventId] })],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    /** HMAC-SHA256(secret, phone || code). */
    codeHash: text("code_hash").notNull(),
    createdAt: tstz("created_at").notNull().default(now()),
    expiresAt: tstz("expires_at").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    consumedAt: tstz("consumed_at"),
    ip: inet("ip"),
    provider: text("provider").notNull(),
    /** Provider message id (for otpDeliveryStatus). Added in Ф2: plan 5 has no column for it. */
    providerMsgId: text("provider_msg_id"),
  },
  (t) => [check("otp_attempts_check", sql`${t.attempts} <= 5`), index("otp_phone_idx").on(t.phone, t.createdAt.desc())],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: tstz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------- events ----------

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references((): AnyPgColumn => events.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    durationS: smallint("duration_s"),
    status: mediaStatusEnum("status").notNull().default("uploaded"),
    createdAt: tstz("created_at").notNull().default(now()),
  },
  (t) => [check("media_bytes_check", sql`${t.bytes} > 0 and ${t.bytes} <= 20000000`)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    kind: eventKindEnum("kind").notNull(),
    title: text("title").notNull(),
    hostsLine: text("hosts_line"),
    startsOn: date("starts_on").notNull(),
    startsAt: time("starts_at"),
    tz: text("tz").notNull().default("Asia/Almaty"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    mapUrl: text("map_url"),
    invitationTextKk: text("invitation_text_kk"),
    invitationTextRu: text("invitation_text_ru"),
    defaultLocale: localeEnum("default_locale").notNull().default("kk"),
    templateId: text("template_id").notNull().default("classic"),
    coverAssetId: uuid("cover_asset_id").references((): AnyPgColumn => mediaAssets.id, { onDelete: "set null" }),
    musicAssetId: uuid("music_asset_id").references((): AnyPgColumn => mediaAssets.id, { onDelete: "set null" }),
    hallColumns: smallint("hall_columns"),
    tablesCount: smallint("tables_count"),
    seatsPerTable: smallint("seats_per_table").notNull().default(12),
    pricePerSeat: bigint("price_per_seat", { mode: "number" }),
    budgetTotal: bigint("budget_total", { mode: "number" }),
    doorToken: text("door_token").notNull().unique(),
    rsvpClosesAt: tstz("rsvp_closes_at"),
    /** Ф8: guests see their table number and the mini-map on the invitation (owner switch «Үстел нөмірін көрсету»). */
    showTableNumbers: boolean("show_table_numbers").notNull().default(false),
    seatingVersion: integer("seating_version").notNull().default(0),
    version: integer("version").notNull().default(0),
    createdAt: tstz("created_at").notNull().default(now()),
    updatedAt: tstz("updated_at").notNull().default(now()),
    deletedAt: tstz("deleted_at"),
    purgeAfter: date("purge_after"),
  },
  (t) => [
    check("events_title_check", sql`length(${t.title}) between 1 and 120`),
    check("events_hosts_line_check", sql`length(${t.hostsLine}) <= 120`),
    check("events_map_url_check", sql`${t.mapUrl} ~ '^https://'`),
    check("events_inv_kk_check", sql`length(${t.invitationTextKk}) <= 2000`),
    check("events_inv_ru_check", sql`length(${t.invitationTextRu}) <= 2000`),
    check("events_hall_columns_check", sql`${t.hallColumns} in (2,4)`),
    check("events_tables_count_check", sql`${t.tablesCount} between 1 and 60`),
    check("events_seats_per_table_check", sql`${t.seatsPerTable} between 6 and 16`),
    check("events_price_check", sql`${t.pricePerSeat} >= 0`),
    check("events_budget_check", sql`${t.budgetTotal} >= 0`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    code: text("code"),
    labelKk: text("label_kk").notNull(),
    labelRu: text("label_ru"),
    seatingRank: smallint("seating_rank").notNull(),
    isCustom: boolean("is_custom").notNull().default(false),
    colorToken: text("color_token").notNull().default("cat-8"),
  },
  (t) => [
    // (event_id, seating_rank) unique DEFERRABLE — added in the migration by hand.
    unique("categories_event_label_kk_key").on(t.eventId, t.labelKk),
    check("categories_label_kk_check", sql`length(${t.labelKk}) between 1 and 40`),
    check("categories_label_ru_check", sql`length(${t.labelRu}) <= 40`),
  ],
);

export const eventMembers = pgTable(
  "event_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    phone: text("phone").notNull(),
    role: memberRoleEnum("role").notNull().default("editor"),
    canEditSeating: boolean("can_edit_seating").notNull().default(false),
    label: text("label").notNull(),
    /** The person's name as the owner typed it («Гүлжан», Ф3 members screen); shown as «Анасы · Гүлжан». */
    displayName: text("display_name"),
    memberKind: memberKindEnum("member_kind").notNull().default("other"),
    canManageBudget: boolean("can_manage_budget").notNull().default(false),
    defaultCategoryId: uuid("default_category_id").references(() => categories.id, { onDelete: "set null" }),
    invitedAt: tstz("invited_at").notNull().default(now()),
    joinedAt: tstz("joined_at"),
    removedAt: tstz("removed_at"),
  },
  (t) => [
    unique("event_members_event_phone_key").on(t.eventId, t.phone),
    check("event_members_phone_check", sql`${t.phone} ~ ${PHONE_RE}`),
    check("event_members_label_check", sql`length(${t.label}) <= 30`),
    check("event_members_display_name_check", sql`length(${t.displayName}) <= 40`),
    uniqueIndex("one_owner_per_event")
      .on(t.eventId)
      .where(sql`${t.role} = 'owner'`),
    index("members_user_idx")
      .on(t.userId)
      .where(sql`${t.removedAt} is null`),
  ],
);

export const loginLinks = pgTable(
  "login_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    phone: text("phone").notNull(),
    memberId: uuid("member_id").references(() => eventMembers.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: tstz("created_at").notNull().default(now()),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    usedSessionId: text("used_session_id").references(() => sessions.id, { onDelete: "set null" }),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [
    check("login_links_phone_check", sql`${t.phone} ~ ${PHONE_RE}`),
    check("login_links_purpose_check", sql`${t.purpose} in ('member','owner_bootstrap')`),
    index("login_links_member_idx")
      .on(t.memberId)
      .where(sql`${t.usedAt} is null and ${t.revokedAt} is null`),
  ],
);

export const allowedOwners = pgTable(
  "allowed_owners",
  {
    phone: text("phone").primaryKey(),
    note: text("note"),
    createdAt: tstz("created_at").notNull().default(now()),
  },
  (t) => [check("allowed_owners_phone_check", sql`${t.phone} ~ ${PHONE_RE}`)],
);

export const hallTables = pgTable(
  "hall_tables",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    no: smallint("no").notNull(),
    capacity: smallint("capacity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.no] }),
    check("hall_tables_no_check", sql`${t.no} >= 1`),
    check("hall_tables_capacity_check", sql`${t.capacity} between 1 and 20`),
  ],
);

export const families = pgTable(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    addedByMemberId: uuid("added_by_member_id")
      .notNull()
      .references(() => eventMembers.id),
    name: text("name").notNull(),
    phone: text("phone"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    expectedCount: smallint("expected_count").notNull(),
    rsvp: rsvpStatusEnum("rsvp").notNull().default("pending"),
    confirmedCount: smallint("confirmed_count"),
    respondedAt: tstz("responded_at"),
    answeredBy: answerSourceEnum("answered_by"),
    answeredByMemberId: uuid("answered_by_member_id").references(() => eventMembers.id),
    tableNo: smallint("table_no"),
    seatLocked: boolean("seat_locked").notNull().default(false),
    lockedByMemberId: uuid("locked_by_member_id").references(() => eventMembers.id),
    /** Stable data order = `seq` of the seating engine (Ф7a review, decision 11). */
    seatSeq: integer("seat_seq").notNull().default(0),
    token: text("token").notNull().unique(),
    sentAt: tstz("sent_at"),
    remindedAt: tstz("reminded_at"),
    tableSentAt: tstz("table_sent_at"),
    firstOpenedAt: tstz("first_opened_at"),
    arrivedAt: tstz("arrived_at"),
    rsvpConsentAt: tstz("rsvp_consent_at"),
    version: integer("version").notNull().default(0),
    createdAt: tstz("created_at").notNull().default(now()),
    updatedAt: tstz("updated_at").notNull().default(now()),
    deletedAt: tstz("deleted_at"),
  },
  (t) => [
    // ⚠ Hand-written in db/migrations/0002_pg15_constraints.sql as
    //   ON DELETE SET NULL (table_no)  — PostgreSQL 15+, Drizzle cannot express the column list.
    // Drizzle's snapshot only knows "on delete set null": do NOT let a future `drizzle-kit generate`
    // drop/recreate this FK (that would also null event_id). Guarded by tests/integration/schema-seed.test.ts.
    foreignKey({
      name: "families_event_table_fk",
      columns: [t.eventId, t.tableNo],
      foreignColumns: [hallTables.eventId, hallTables.no],
    }).onDelete("set null"),
    check("families_name_check", sql`length(${t.name}) between 1 and 80`),
    check("families_phone_check", sql`${t.phone} ~ ${PHONE_RE}`),
    check("families_expected_check", sql`${t.expectedCount} between 1 and 20`),
    check("families_confirmed_check", sql`${t.confirmedCount} between 1 and 20`),
    check("families_yes_confirmed_check", sql`${t.rsvp} <> 'yes' or ${t.confirmedCount} is not null`),
    check("families_lock_check", sql`${t.tableNo} is not null or ${t.seatLocked} = false`),
    uniqueIndex("families_phone_uniq")
      .on(t.eventId, t.phone)
      .where(sql`${t.phone} is not null and ${t.deletedAt} is null`),
    index("families_event_idx")
      .on(t.eventId)
      .where(sql`${t.deletedAt} is null`),
    index("families_table_idx")
      .on(t.eventId, t.tableNo)
      .where(sql`${t.deletedAt} is null`),
    index("families_member_idx")
      .on(t.eventId, t.addedByMemberId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const duplicateReviews = pgTable(
  "duplicate_reviews",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    familyA: uuid("family_a")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    familyB: uuid("family_b")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => eventMembers.id),
    decidedAt: tstz("decided_at").notNull().default(now()),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.familyA, t.familyB] }),
    check("duplicate_reviews_order_check", sql`${t.familyA} < ${t.familyB}`),
  ],
);

export const seatingChanges = pgTable(
  "seating_changes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    actorKind: text("actor_kind").notNull(),
    actorMemberId: uuid("actor_member_id").references(() => eventMembers.id),
    action: seatingActionEnum("action").notNull(),
    summary: jsonb("summary").notNull(),
    diff: jsonb("diff").notNull(),
    seatingVersionAfter: integer("seating_version_after").notNull(),
    revertOf: bigint("revert_of", { mode: "number" }).references((): AnyPgColumn => seatingChanges.id),
    revertedBy: bigint("reverted_by", { mode: "number" }).references((): AnyPgColumn => seatingChanges.id),
    createdAt: tstz("created_at").notNull().default(now()),
  },
  (t) => [
    check("seating_changes_actor_check", sql`${t.actorKind} in ('member','guest','system')`),
    index("seating_changes_event_idx").on(t.eventId, t.createdAt.desc()),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    plannedAmount: bigint("planned_amount", { mode: "number" }).notNull().default(0),
    paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
    dueDate: date("due_date"),
    note: text("note"),
    linkedToSeats: boolean("linked_to_seats").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => eventMembers.id),
    updatedBy: uuid("updated_by").references(() => eventMembers.id),
    createdAt: tstz("created_at").notNull().default(now()),
    updatedAt: tstz("updated_at").notNull().default(now()),
  },
  (t) => [
    check(
      "expenses_category_check",
      sql`${t.category} in ('restaurant','asaba','clothes','gifts','decor','photo','transport','other')`,
    ),
    check("expenses_title_check", sql`length(${t.title}) between 1 and 80`),
    check("expenses_planned_check", sql`${t.plannedAmount} >= 0`),
    check("expenses_paid_check", sql`${t.paidAmount} >= 0`),
    check("expenses_note_check", sql`length(${t.note}) <= 500`),
    index("expenses_event_idx").on(t.eventId),
  ],
);

export const doorCheckins = pgTable(
  "door_checkins",
  {
    opId: uuid("op_id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    arrived: boolean("arrived").notNull(),
    clientAt: tstz("client_at").notNull(),
    receivedAt: tstz("received_at").notNull().default(now()),
    deviceId: text("device_id").notNull(),
  },
  (t) => [index("door_checkins_family_idx").on(t.familyId, t.clientAt.desc())],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    at: tstz("at").notNull().default(now()),
    meta: jsonb("meta"),
  },
  (t) => [index("activity_event_idx").on(t.eventId, t.kind, t.at)],
);

export const smsLog = pgTable("sms_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** sha256(phone) — lookup without storing the number. */
  phoneHash: text("phone_hash").notNull(),
  /** +7 701 *** ** 41 */
  phoneMasked: text("phone_masked").notNull(),
  provider: text("provider").notNull(),
  providerMsgId: text("provider_msg_id"),
  status: text("status").notNull(),
  costTiyn: integer("cost_tiyn"),
  createdAt: tstz("created_at").notNull().default(now()),
});
