import { localStorage, storage, verifyUpload } from "@/server/storage";

/**
 * Local storage driver: the browser's signed PUT (Ф5, the stand-in for an S3 presigned PUT). The signature binds
 * key, mime, max size and expiry (5 min); the body may not be larger than signed.
 */
export const runtime = "nodejs";

export async function PUT(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  // Ф5 review П1: only the local driver uploads here; with s3 the browser PUTs to the bucket.
  if (storage().driver !== "local") return new Response(null, { status: 404 });
  const key = (await ctx.params).key.join("/");
  const q = new URL(req.url).searchParams;
  const mime = q.get("mime") ?? "";
  const bytes = Number(q.get("bytes"));
  if (!verifyUpload(key, mime, bytes, Number(q.get("exp")), q.get("sig") ?? ""))
    return new Response(null, { status: 403 });
  if ((req.headers.get("content-type") ?? "").split(";")[0] !== mime) return new Response(null, { status: 415 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0 || body.length > bytes) return new Response(null, { status: 413 });
  await localStorage().write(key, body);
  return new Response(null, { status: 200 });
}
