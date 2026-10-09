-- Constraints Drizzle cannot express (plan section 5). Expand-only.
-- 1) Removing a hall table unseats its families but keeps event_id: ON DELETE SET NULL (table_no) — PostgreSQL 15+.
ALTER TABLE "families" DROP CONSTRAINT "families_event_table_fk";--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_event_table_fk"
  FOREIGN KEY ("event_id", "table_no") REFERENCES "hall_tables"("event_id", "no") ON DELETE SET NULL ("table_no");--> statement-breakpoint
-- 2) Category order: unique per event, checked at commit so a reorder can swap ranks in one transaction.
ALTER TABLE "categories" ADD CONSTRAINT "categories_event_rank_key"
  UNIQUE ("event_id", "seating_rank") DEFERRABLE INITIALLY DEFERRED;
