import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Empty every application table (keeps the drizzle migrations journal). */
export async function resetDb(): Promise<void> {
  await db().execute(sql`
    truncate table door_checkins, activity_log, duplicate_reviews, seating_changes, expenses, families,
      hall_tables, login_links, event_members, categories, media_assets, events, otp_challenges,
      sessions, users, allowed_owners, rate_limits, sms_log restart identity cascade`);
}

export const at = (iso: string) => new Date(iso);
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
