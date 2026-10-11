import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { authorize, ForbiddenError, type Principal } from "../auth/access";
import type { Db } from "../db";
import { canCreateEvents } from "../events/service";
import { events, mediaAssets } from "../schema";
import { storage } from "../storage";

/**
 * Ф5 music (plan 6.2 `createUploadUrl` / `finalizeUpload`, brief §2): the owner uploads mp3 / m4a / aac ≤ 20 MB
 * straight to storage, then the server cuts the first 90 s, encodes MP3 96 kbit/s with a 3 s fade-out (≈ 1.1 MB)
 * and stores it under a content-hashed key. `media_assets.status`: uploaded → processing → ready | failed.
 * In the wizard there is no event yet: the asset is a draft of the user (`event_id` null, key `music/u-<userId>/…`)
 * and `createEvent` attaches it.
 */
export const MUSIC_MIMES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"] as const;
export const MUSIC_MAX_BYTES = 20_000_000;
export const MUSIC_SECONDS = 90;
const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

type Owner = { eventId: string | null; prefix: string };

async function ownerOf(db: Db, who: Principal, eventId: string | null): Promise<Owner> {
  if (eventId) {
    await authorize(db, who, eventId, "owner");
    return { eventId, prefix: `music/${eventId}` };
  }
  if ((await canCreateEvents(db, who)) !== "ok") throw new ForbiddenError();
  return { eventId: null, prefix: `music/u-${who.userId}` };
}

export type UploadTarget =
  { ok: true; assetId: string; url: string; headers: Record<string, string> } | { ok: false; error: "type" | "size" };

export async function createUploadUrl(
  db: Db,
  who: Principal,
  input: { eventId: string | null; mime: string; bytes: number },
): Promise<UploadTarget> {
  const o = await ownerOf(db, who, input.eventId);
  if (!(MUSIC_MIMES as readonly string[]).includes(input.mime)) return { ok: false, error: "type" };
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > MUSIC_MAX_BYTES)
    return { ok: false, error: "size" };
  const key = `${o.prefix}/upload-${randomUUID()}.${EXT[input.mime]}`;
  const [row] = await db
    .insert(mediaAssets)
    .values({
      eventId: o.eventId,
      kind: "music",
      storageKey: key,
      mime: input.mime,
      bytes: input.bytes,
      status: "uploaded",
    })
    .returning({ id: mediaAssets.id });
  const put = await storage().putUrl(key, input.mime, input.bytes);
  return { ok: true, assetId: row!.id, url: put.url, headers: put.headers };
}

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg-static binary is not available");
  return p;
}

/** First 90 s, MP3 96 kbit/s stereo 44.1 kHz, fade-out over the last 3 s; returns the encoded file and duration. */
export async function transcodeMusic(input: Buffer): Promise<{ data: Buffer; seconds: number }> {
  const dir = await mkdtemp(join(tmpdir(), "toi-music-"));
  try {
    const src = join(dir, "in");
    const out = join(dir, "out.mp3");
    await writeFile(src, input);
    const stderr = await new Promise<string>((ok, fail) =>
      execFile(
        ffmpegPath(),
        [
          "-hide_banner",
          "-y",
          "-i",
          src,
          "-t",
          String(MUSIC_SECONDS),
          "-vn",
          "-map_metadata",
          "-1",
          "-ac",
          "2",
          "-ar",
          "44100",
          "-b:a",
          "96k",
          "-af",
          `afade=t=out:st=${MUSIC_SECONDS - 3}:d=3`,
          out,
        ],
        { timeout: 55_000, maxBuffer: 4 * 1024 * 1024 },
        (err, _o, e) => (err ? fail(Object.assign(err, { stderr: e })) : ok(e)),
      ),
    );
    const data = await readFile(out);
    const m = stderr
      .match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)
      ?.pop()
      ?.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const seconds = m ? Math.round(+m[1]! * 3600 + +m[2]! * 60 + +m[3]!) : MUSIC_SECONDS;
    return { data, seconds: Math.min(seconds, MUSIC_SECONDS) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type FinalizeResult =
  | { ok: true; assetId: string; url: string; seconds: number; bytes: number }
  | { ok: false; error: "missing" | "failed" };

export async function finalizeUpload(db: Db, who: Principal, assetId: string): Promise<FinalizeResult> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new ForbiddenError();
  const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
  if (!a || a.kind !== "music") throw new ForbiddenError();
  const o = await ownerOf(db, who, a.eventId);
  if (!a.storageKey.startsWith(`${o.prefix}/`)) throw new ForbiddenError();
  if (a.status === "ready")
    return { ok: true, assetId, url: await storage().getUrl(a.storageKey), seconds: a.durationS ?? 0, bytes: a.bytes };
  const size = await storage().size(a.storageKey);
  if (!size || size > MUSIC_MAX_BYTES) {
    await db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, assetId));
    return { ok: false, error: "missing" };
  }
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, assetId));
  try {
    const { data, seconds } = await transcodeMusic(await storage().read(a.storageKey));
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 32);
    const key = `${o.prefix}/${hash}.mp3`;
    await storage().write(key, data, "audio/mpeg");
    await storage().remove(a.storageKey);
    await db
      .update(mediaAssets)
      .set({ storageKey: key, mime: "audio/mpeg", bytes: data.length, durationS: seconds, status: "ready" })
      .where(eq(mediaAssets.id, assetId));
    if (a.eventId)
      await db.update(events).set({ musicAssetId: assetId, updatedAt: new Date() }).where(eq(events.id, a.eventId));
    return { ok: true, assetId, url: await storage().getUrl(key), seconds, bytes: data.length };
  } catch {
    await db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, assetId));
    return { ok: false, error: "failed" };
  }
}

/** «Алып тастау»: the event has no music any more (the file stays until cleanup). */
export async function removeMusic(db: Db, who: Principal, eventId: string) {
  await authorize(db, who, eventId, "owner");
  await db.update(events).set({ musicAssetId: null, updatedAt: new Date() }).where(eq(events.id, eventId));
  return { ok: true as const };
}

/** `createEvent`: attach the user's ready draft music to the new event. */
export async function attachDraftMusic(db: Db, who: Principal, eventId: string, assetId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return false;
  const [a] = await db
    .select({ key: mediaAssets.storageKey })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), isNull(mediaAssets.eventId), eq(mediaAssets.status, "ready")));
  if (!a || !a.key.startsWith(`music/u-${who.userId}/`)) return false;
  await db.update(mediaAssets).set({ eventId }).where(eq(mediaAssets.id, assetId));
  await db.update(events).set({ musicAssetId: assetId }).where(eq(events.id, eventId));
  return true;
}
