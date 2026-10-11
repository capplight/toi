import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "../env";

/**
 * Ф5 file storage (plan 4.4, brief §2): the application only knows this interface. Two drivers by `STORAGE_DRIVER`:
 * - `local` — folder `LOCAL_STORAGE_DIR` (`.data/uploads`, git-ignored); the browser uploads with a signed PUT to
 *   `/api/upload/{key}` and files are served by `/api/files/{key}` (Range, immutable cache);
 * - `s3` — R2 on the pilot, S3 in KZ later: presigned PUT/GET through `@aws-sdk/client-s3`.
 * Keys are relative paths of `[a-z0-9/_.-]`; content-addressed keys (with a hash) are immutable.
 */
export type PutTarget = { url: string; method: "PUT"; headers: Record<string, string>; expiresAt: Date };

export interface Storage {
  readonly driver: "local" | "s3";
  /** URL the browser PUTs the file to (5 minutes). */
  putUrl(key: string, mime: string, bytes: number): Promise<PutTarget>;
  /** URL the browser reads the file from (immutable content). */
  getUrl(key: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  write(key: string, data: Buffer, mime: string): Promise<void>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

export const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;
const PUT_TTL_MS = 5 * 60_000;

export function assertKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new Error(`bad storage key: ${key}`);
}

/* ------------------------------------------------------------------ local */

function sign(payload: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(`upload:${payload}`).digest("base64url");
}

/** Signature of a local PUT: key + mime + max bytes + expiry. */
export function signUpload(key: string, mime: string, bytes: number, exp: number): string {
  return sign(`${key}|${mime}|${bytes}|${exp}`);
}

export function verifyUpload(
  key: string,
  mime: string,
  bytes: number,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(exp) || exp < now) return false;
  const want = Buffer.from(signUpload(key, mime, bytes, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

class LocalStorage implements Storage {
  readonly driver = "local" as const;
  private root = resolve(env().LOCAL_STORAGE_DIR);

  path(key: string): string {
    assertKey(key);
    const p = resolve(join(this.root, ...key.split("/")));
    if (!p.startsWith(this.root + sep)) throw new Error("path escapes the storage root");
    return p;
  }
  async putUrl(key: string, mime: string, bytes: number): Promise<PutTarget> {
    assertKey(key);
    const exp = Date.now() + PUT_TTL_MS;
    const q = new URLSearchParams({
      mime,
      bytes: String(bytes),
      exp: String(exp),
      sig: signUpload(key, mime, bytes, exp),
    });
    return {
      url: `/api/upload/${key}?${q}`,
      method: "PUT",
      headers: { "content-type": mime },
      expiresAt: new Date(exp),
    };
  }
  async getUrl(key: string): Promise<string> {
    assertKey(key);
    return `/api/files/${key}`;
  }
  async read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }
  async write(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }
  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/* ------------------------------------------------------------------ s3 */

class S3Storage implements Storage {
  readonly driver = "s3" as const;
  private async sdk() {
    const s3 = await import("@aws-sdk/client-s3");
    const presign = await import("@aws-sdk/s3-request-presigner");
    const c = env().s3!;
    const client = new s3.S3Client({
      region: c.region,
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      forcePathStyle: true,
    });
    return { s3, presign, client, bucket: c.bucket };
  }
  async putUrl(key: string, mime: string, bytes: number): Promise<PutTarget> {
    assertKey(key);
    const { s3, presign, client, bucket } = await this.sdk();
    const cmd = new s3.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, ContentLength: bytes });
    const url = await presign.getSignedUrl(client, cmd, { expiresIn: PUT_TTL_MS / 1000 });
    return { url, method: "PUT", headers: { "content-type": mime }, expiresAt: new Date(Date.now() + PUT_TTL_MS) };
  }
  async getUrl(key: string): Promise<string> {
    assertKey(key);
    const { s3, presign, client, bucket } = await this.sdk();
    return presign.getSignedUrl(client, new s3.GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 7 * 86_400,
    });
  }
  async read(key: string): Promise<Buffer> {
    const { s3, client, bucket } = await this.sdk();
    const r = await client.send(new s3.GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async write(key: string, data: Buffer, mime: string): Promise<void> {
    const { s3, client, bucket } = await this.sdk();
    await client.send(
      new s3.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async size(key: string): Promise<number | null> {
    const { s3, client, bucket } = await this.sdk();
    try {
      const r = await client.send(new s3.HeadObjectCommand({ Bucket: bucket, Key: key }));
      return r.ContentLength ?? null;
    } catch {
      return null;
    }
  }
  async remove(key: string): Promise<void> {
    const { s3, client, bucket } = await this.sdk();
    await client.send(new s3.DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

let cached: Storage | undefined;
export function storage(): Storage {
  cached ??= env().STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return cached;
}

/** For the local file routes only. */
export function localStorage(): LocalStorage {
  const s = storage();
  if (s.driver !== "local") throw new Error("local storage driver is not active");
  return s as LocalStorage;
}
