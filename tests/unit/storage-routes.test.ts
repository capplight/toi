import { afterAll, describe, expect, it, vi } from "vitest";

const saved = { ...process.env };
afterAll(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

/** Ф5 review П1: the local upload / file routes do not exist when the active driver is s3. */
describe("local storage routes with STORAGE_DRIVER=s3", () => {
  it("answer 404 before touching any storage", async () => {
    vi.resetModules();
    const secret = "x".repeat(44);
    Object.assign(process.env, {
      APP_URL: "http://localhost:3000",
      APP_DOMAIN: "toi-pilot.vercel.app",
      DATABASE_URL: "postgres://u:p@localhost:5432/toi",
      SESSION_SECRET: secret,
      OTP_HMAC_SECRET: secret,
      CRON_SECRET: secret,
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://r2.example",
      S3_BUCKET: "toi",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "key",
    });
    const files = await import("@/app/api/files/[...key]/route");
    const upload = await import("@/app/api/upload/[...key]/route");
    const params = Promise.resolve({ key: ["music", "x.mp3"] });
    expect((await files.GET(new Request("http://localhost/api/files/music/x.mp3"), { params })).status).toBe(404);
    expect(
      (
        await upload.PUT(new Request("http://localhost/api/upload/music/x.mp3", { method: "PUT", body: "x" }), {
          params,
        })
      ).status,
    ).toBe(404);
  });
});
