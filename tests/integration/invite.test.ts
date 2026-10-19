import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

// Local storage driver in a temp folder (set before the first env() call of this file).
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = mkdtempSync(join(tmpdir(), "toi-storage-"));

import type { Principal } from "@/server/auth/access";
import { db } from "@/server/db";
import { answerAsGuest, loadGuestPage, notFoundAllowed, pingGuest, RSVP_PER_HOUR } from "@/server/invite/guest";
import { renderInvite } from "@/server/invite/render";
import { createUploadUrl, FINALIZE_PER_HOUR, finalizeUpload, MUSIC_SECONDS } from "@/server/media/music";
import { activityLog, eventMembers, events, families, mediaAssets, seatingChanges, users } from "@/server/schema";
import { storage } from "@/server/storage";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-10-11T08:00:00Z"); // the seeded event is on 2026-11-15

async function setup() {
  const s = await seedSample(db(), NOW);
  const rows = await db().select().from(families).where(eq(families.eventId, s.eventId));
  const seatedPending = rows.find((f) => f.rsvp === "pending" && f.tableNo !== null && !f.seatLocked)!;
  return { s, rows, f: seatedPending };
}

const version = async (eventId: string) =>
  (await db().select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId)))[0]!.v;

describe("guest answer through the seating adapter (brief Ф5 §2)", () => {
  it("«Келеміз»: answered_by guest, version + 1, history with actor guest and from → to, seated family stays", async () => {
    const { s, f } = await setup();
    const v0 = await version(s.eventId);
    const r = await answerAsGuest(db(), f.token, { attending: true, seats: f.expectedCount + 3 }, { now: NOW });
    expect(r).toEqual({ ok: true, rsvp: "yes", seats: f.expectedCount + 3 });
    const [row] = await db().select().from(families).where(eq(families.id, f.id));
    expect(row).toMatchObject({
      rsvp: "yes",
      confirmedCount: f.expectedCount + 3,
      answeredBy: "guest",
      tableNo: f.tableNo,
    });
    expect(row!.respondedAt).toEqual(NOW);
    expect(await version(s.eventId)).toBe(v0 + 1);
    const [h] = await db()
      .select()
      .from(seatingChanges)
      .where(eq(seatingChanges.eventId, s.eventId))
      .orderBy(desc(seatingChanges.id))
      .limit(1);
    expect(h).toMatchObject({ actorKind: "guest", actorMemberId: null, action: "answer" });
    expect(h!.summary).toMatchObject({
      by: "guest",
      from: { rsvp: "pending" },
      to: { rsvp: "yes", confirmed: f.expectedCount + 3 },
    });
  });

  it("«Келе алмаймыз» frees the seat; the answer can be changed until rsvp_closes_at, then 409 (closed)", async () => {
    const { s, f } = await setup();
    expect(await answerAsGuest(db(), f.token, { attending: false }, { now: NOW })).toMatchObject({
      ok: true,
      rsvp: "no",
    });
    expect((await db().select().from(families).where(eq(families.id, f.id)))[0]!.tableNo).toBeNull();
    expect(await answerAsGuest(db(), f.token, { attending: true, seats: 2 }, { now: NOW })).toMatchObject({ ok: true });
    // default close: the start of the event day in Almaty
    expect(await answerAsGuest(db(), f.token, { attending: false }, { now: new Date("2026-11-14T19:00:01Z") })).toEqual(
      {
        ok: false,
        error: "closed",
      },
    );
    await db()
      .update(events)
      .set({ rsvpClosesAt: new Date("2026-10-10T00:00:00Z") })
      .where(eq(events.id, s.eventId));
    expect(await answerAsGuest(db(), f.token, { attending: false }, { now: NOW })).toEqual({
      ok: false,
      error: "closed",
    });
  });

  it("seats 1–20; consent when required; 10 answers per hour per token", async () => {
    const { f } = await setup();
    expect(await answerAsGuest(db(), f.token, { attending: true, seats: 21 }, { now: NOW })).toEqual({
      ok: false,
      error: "seats",
    });
    expect(
      await answerAsGuest(db(), f.token, { attending: true, seats: 2 }, { now: NOW, requireConsent: true }),
    ).toEqual({
      ok: false,
      error: "consent",
    });
    for (let i = 0; i < RSVP_PER_HOUR; i++) {
      expect((await answerAsGuest(db(), f.token, { attending: i % 2 === 0, seats: 2 }, { now: NOW })).ok).toBe(true);
    }
    expect(await answerAsGuest(db(), f.token, { attending: true, seats: 2 }, { now: NOW })).toEqual({
      ok: false,
      error: "rateLimited",
    });
  });

  it("deleted family or event → not found; garbage tokens never reach the DB; 404 limiter 30/min per IP", async () => {
    const { s, rows } = await setup();
    const [a, b] = rows;
    await db().update(families).set({ deletedAt: NOW }).where(eq(families.id, a!.id));
    expect(await loadGuestPage(db(), a!.token)).toBeNull();
    expect(await answerAsGuest(db(), a!.token, { attending: true }, { now: NOW })).toEqual({
      ok: false,
      error: "notFound",
    });
    await db().update(events).set({ deletedAt: NOW }).where(eq(events.id, s.eventId));
    expect(await loadGuestPage(db(), b!.token)).toBeNull();
    expect(await loadGuestPage(db(), "<script>")).toBeNull();
    for (let i = 0; i < 30; i++) expect(await notFoundAllowed(db(), "10.0.0.9", NOW)).toBe(true);
    expect(await notFoundAllowed(db(), "10.0.0.9", NOW)).toBe(false);
  });

  it("pings: activity_log and first_opened_at (kept from the first opening)", async () => {
    const { f } = await setup();
    await pingGuest(db(), f.token, "opened", NOW);
    await pingGuest(db(), f.token, "envelope", NOW);
    await pingGuest(db(), f.token, "opened", new Date(NOW.getTime() + 60_000));
    const log = await db().select().from(activityLog).where(eq(activityLog.familyId, f.id));
    expect(log.map((l) => l.kind).sort()).toEqual(["envelope_opened", "invite_opened", "invite_opened"]);
    expect((await db().select().from(families).where(eq(families.id, f.id)))[0]!.firstOpenedAt).toEqual(NOW);
  });

  it("the page HTML: family name escaped, no React, JS island under 10 KB, states", async () => {
    const { f } = await setup();
    await db().update(families).set({ name: `<img src=x onerror=alert(1)> отбасы` }).where(eq(families.id, f.id));
    const page = (await loadGuestPage(db(), f.token))!;
    const html = renderInvite(page, {
      locale: "kk",
      nonce: "n",
      now: NOW,
      open: false,
      view: "form",
      appUrl: "https://x",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; отбасы");
    expect(html).not.toMatch(/react|__next|_next\/static/i);
    const script = html.match(/<script nonce="n">([\s\S]*?)<\/script>/)![1]!;
    expect(script.length).toBeLessThan(10_000);
    expect(html).toContain('class="scene"');
    const answered = renderInvite(
      { ...page, family: { ...page.family, rsvp: "yes", confirmed: 3 } },
      {
        locale: "ru",
        nonce: "n",
        now: NOW,
        open: true,
        view: "answered",
        appUrl: "https://x",
      },
    );
    expect(answered).not.toContain('class="scene"');
    expect(answered).toContain('data-state="answered"');
    expect(answered).toContain('lang="ru"');
  });
});

describe("music on the local storage driver (brief §3.3)", () => {
  async function owner(s: Awaited<ReturnType<typeof seedSample>>): Promise<Principal> {
    const [u] = await db()
      .insert(users)
      .values({ phone: DEMO_PHONES.ake })
      .onConflictDoUpdate({ target: users.phone, set: { phone: DEMO_PHONES.ake } })
      .returning({ id: users.id });
    await db()
      .update(eventMembers)
      .set({ userId: u!.id })
      .where(and(eq(eventMembers.eventId, s.eventId), eq(eventMembers.role, "owner")));
    return { userId: u!.id, scope: "all", sessionId: "n/a" };
  }

  async function sineMp3(seconds: number): Promise<Buffer> {
    const dir = mkdtempSync(join(tmpdir(), "toi-sine-"));
    const out = join(dir, "s.mp3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ff = require("ffmpeg-static") as string;
    await new Promise<void>((ok, fail) =>
      execFile(
        ff,
        ["-hide_banner", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-b:a", "192k", out],
        (e) => (e ? fail(e) : ok()),
      ),
    );
    const data = await readFile(out);
    await rm(dir, { recursive: true, force: true });
    return data;
  }

  it("createUploadUrl → (browser PUT) → finalizeUpload: ready, first 90 s at 96 kbit/s, content-hashed key, attached", async () => {
    const s = await seedSample(db(), NOW);
    const who = await owner(s);
    const src = await sineMp3(120);
    expect(await createUploadUrl(db(), who, { eventId: s.eventId, mime: "audio/ogg", bytes: 10 })).toEqual({
      ok: false,
      error: "type",
    });
    expect(await createUploadUrl(db(), who, { eventId: s.eventId, mime: "audio/mpeg", bytes: 20_000_001 })).toEqual({
      ok: false,
      error: "size",
    });
    const up = await createUploadUrl(db(), who, { eventId: s.eventId, mime: "audio/mpeg", bytes: src.length });
    if (!up.ok) throw new Error("upload url");
    expect(up.url).toMatch(/^\/api\/upload\/music\/.+\?mime=audio%2Fmpeg&bytes=\d+&exp=\d+&sig=/);
    const key = up.url.split("?")[0]!.replace("/api/upload/", "");
    await storage().write(key, src, "audio/mpeg"); // what the PUT route does after checking the signature
    const r = await finalizeUpload(db(), who, up.assetId);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.seconds).toBe(MUSIC_SECONDS);
    expect(r.bytes).toBeLessThan(1_200_000);
    expect(r.bytes).toBeGreaterThan(900_000);
    const [a] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, up.assetId));
    expect(a).toMatchObject({ status: "ready", mime: "audio/mpeg", durationS: MUSIC_SECONDS });
    expect(a!.storageKey).toMatch(new RegExp(`^music/${s.eventId}/[0-9a-f]{32}-[0-9a-f]{8}\\.mp3$`));
    expect(await storage().size(key)).toBeNull(); // the original upload is removed
    const [ev] = await db().select().from(events).where(eq(events.id, s.eventId));
    expect(ev!.musicAssetId).toBe(up.assetId);
    expect((await loadGuestPage(db(), (await db().select().from(families).limit(1))[0]!.token))!.musicKey).toBe(
      a!.storageKey,
    );
  });

  it("a broken file → failed; another user's asset → 403", async () => {
    const s = await seedSample(db(), NOW);
    const who = await owner(s);
    const up = await createUploadUrl(db(), who, { eventId: s.eventId, mime: "audio/mpeg", bytes: 100 });
    if (!up.ok) throw new Error("upload url");
    await storage().write(
      up.url.split("?")[0]!.replace("/api/upload/", ""),
      Buffer.from("not an mp3 at all"),
      "audio/mpeg",
    );
    expect(await finalizeUpload(db(), who, up.assetId)).toEqual({ ok: false, error: "failed" });
    const [stranger] = await db().insert(users).values({ phone: "+77019990000" }).returning({ id: users.id });
    await expect(
      finalizeUpload(db(), { userId: stranger!.id, scope: "all", sessionId: "x" }, up.assetId),
    ).rejects.toThrow();
  });

  it("Ф5 review Н2: the 11th processing within an hour for one user → rateLimited (ffmpeg is not run)", async () => {
    const { hit } = await import("@/server/ratelimit");
    const s = await seedSample(db(), NOW);
    const who = await owner(s);
    for (let i = 0; i < FINALIZE_PER_HOUR; i++)
      await hit(db(), { key: `music:finalize:${who.userId}`, windowSec: 3600, max: FINALIZE_PER_HOUR }, new Date());
    const up = await createUploadUrl(db(), who, { eventId: s.eventId, mime: "audio/mpeg", bytes: 100 });
    if (!up.ok) throw new Error("upload url");
    await storage().write(up.url.split("?")[0]!.replace("/api/upload/", ""), Buffer.from("x"), "audio/mpeg");
    expect(await finalizeUpload(db(), who, up.assetId)).toEqual({ ok: false, error: "rateLimited" });
    const [a] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, up.assetId));
    expect(a!.status).not.toBe("processing");
  });
});

describe("wizard draft music", () => {
  it("a draft (no event yet) is attached to the event created by the same owner", async () => {
    const { createEvent } = await import("@/server/events/service");
    const { attachDraftMusic } = await import("@/server/media/music");
    const s = await seedSample(db(), NOW);
    void s;
    const [u] = await db().select().from(users).where(eq(users.phone, DEMO_PHONES.ake));
    const who: Principal = { userId: u!.id, scope: "all", sessionId: "n/a" };
    const up = await createUploadUrl(db(), who, { eventId: null, mime: "audio/mpeg", bytes: 50_000 });
    if (!up.ok) throw new Error(JSON.stringify(up));
    const key = up.url.split("?")[0]!.replace("/api/upload/", "");
    const dir = mkdtempSync(join(tmpdir(), "toi-sine2-"));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ff = require("ffmpeg-static") as string;
    await new Promise<void>((ok, fail) =>
      execFile(ff, ["-y", "-f", "lavfi", "-i", "sine=duration=5", join(dir, "a.mp3")], (e) => (e ? fail(e) : ok())),
    );
    await storage().write(key, await readFile(join(dir, "a.mp3")), "audio/mpeg");
    const fin = await finalizeUpload(db(), who, up.assetId);
    expect(fin.ok).toBe(true);
    const ev = await createEvent(db(), who, {
      kind: "merey",
      title: "Музыкамен",
      startsOn: "2026-12-01",
      templateId: "kok-tun",
    });
    if (!ev.ok) throw new Error("event");
    expect(await attachDraftMusic(db(), who, ev.eventId, up.assetId)).toBe(true);
    const [row] = await db().select().from(events).where(eq(events.id, ev.eventId));
    expect(row!.musicAssetId).toBe(up.assetId);
  });
});

describe("Ф5 review П3: daily cleanup of abandoned music", () => {
  it("drafts, failed uploads and replaced tracks older than 24 h go (rows and files); the current track and fresh drafts stay", async () => {
    const { cleanupMusic } = await import("@/server/cleanup");
    const s = await seedSample(db(), NOW);
    const old = new Date(NOW.getTime() - 2 * 86_400_000);
    const mk = async (key: string, opts: { eventId: string | null; status: "ready" | "failed"; at: Date }) => {
      await storage().write(key, Buffer.from(key), "audio/mpeg");
      const [r] = await db()
        .insert(mediaAssets)
        .values({
          eventId: opts.eventId,
          kind: "music",
          storageKey: key,
          mime: "audio/mpeg",
          bytes: 10,
          status: opts.status,
          createdAt: opts.at,
        })
        .returning({ id: mediaAssets.id });
      return r!.id;
    };
    await mk("music/u-x/draft-old.mp3", { eventId: null, status: "ready", at: old });
    await mk(`music/${s.eventId}/failed-old.mp3`, { eventId: s.eventId, status: "failed", at: old });
    await mk(`music/${s.eventId}/replaced-old.mp3`, { eventId: s.eventId, status: "ready", at: old });
    const current = await mk(`music/${s.eventId}/current.mp3`, { eventId: s.eventId, status: "ready", at: old });
    await mk("music/u-x/draft-fresh.mp3", { eventId: null, status: "ready", at: new Date(NOW.getTime() - 3_600_000) });
    await db().update(events).set({ musicAssetId: current }).where(eq(events.id, s.eventId));

    expect(await cleanupMusic(db(), NOW)).toBe(3);
    const left = (await db().select({ k: mediaAssets.storageKey }).from(mediaAssets)).map((r) => r.k).sort();
    expect(left).toEqual([`music/${s.eventId}/current.mp3`, "music/u-x/draft-fresh.mp3"]);
    expect(await storage().size("music/u-x/draft-old.mp3")).toBeNull();
    expect(await storage().size(`music/${s.eventId}/replaced-old.mp3`)).toBeNull();
    expect(await storage().size(`music/${s.eventId}/current.mp3`)).not.toBeNull();
  });
});
