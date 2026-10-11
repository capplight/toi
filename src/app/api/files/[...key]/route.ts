import { localStorage } from "@/server/storage";

/** Local storage driver: file reads with `Range` (audio seeking on iOS) and immutable cache (content-hashed keys). */
export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.join("/");
  let data: Buffer;
  try {
    data = await localStorage().read(key);
  } catch {
    return new Response(null, { status: 404 });
  }
  const type = TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";
  const base = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
  };
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const size = data.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...base, "content-length": String(data.length) } });
}
