import { describe, expect, it, vi } from "vitest";
import { mapMobizonStatus, MobizonProvider } from "@/server/sms/mobizon";
import { mapSmscStatus, SmscKzProvider } from "@/server/sms/smsc";
import { createSmsProvider } from "@/server/sms";
import { parseAllowlist } from "../../scripts/sms-test";

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("SMS status mapping", () => {
  it("SMSC.kz codes", () => {
    expect(mapSmscStatus(-1)).toBe("queued");
    expect(mapSmscStatus(0)).toBe("sent");
    expect(mapSmscStatus(1)).toBe("delivered");
    expect(mapSmscStatus(20)).toBe("failed");
    expect(mapSmscStatus(-3)).toBe("unknown");
  });
  it("Mobizon statuses", () => {
    expect(mapMobizonStatus("ENQUEUD")).toBe("queued");
    expect(mapMobizonStatus("ACCEPTD")).toBe("sent");
    expect(mapMobizonStatus("DELIVRD")).toBe("delivered");
    expect(mapMobizonStatus("REJECTD")).toBe("failed");
    expect(mapMobizonStatus(undefined)).toBe("unknown");
  });
});

describe("SmscKzProvider", () => {
  it("POSTs credentials in the body (not the URL) and parses fmt=3 JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 42, cnt: 1, cost: "13.5" }));
    const p = new SmscKzProvider(
      { login: "LOGIN", password: "PASSWORD", sender: undefined },
      fetchMock as typeof fetch,
    );
    const res = await p.send("+77011234567", "Той: код 1");
    expect(res).toEqual({ providerMsgId: "42", status: "queued", cost: 13.5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://smsc.kz/sys/send.php");
    expect(url).not.toContain("PASSWORD");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("phones")).toBe("77011234567");
    expect(body.get("fmt")).toBe("3");
    expect(body.get("charset")).toBe("utf-8");
  });

  it("errors do not leak credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "authorise error", error_code: 2 }));
    const p = new SmscKzProvider(
      { login: "LOGIN", password: "PASSWORD", sender: undefined },
      fetchMock as typeof fetch,
    );
    await expect(p.send("+77011234567", "x")).rejects.toThrow(/error_code 2/);
    await expect(p.send("+77011234567", "x")).rejects.not.toThrow(/PASSWORD/);
  });
});

describe("MobizonProvider", () => {
  it("sends and reads status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { campaignId: 1, messageId: 77, status: 2 }, message: "" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: [{ id: 77, status: "DELIVRD" }], message: "" }));
    const p = new MobizonProvider({ apiKey: "KEY", apiDomain: "api.mobizon.kz" }, fetchMock as typeof fetch);
    const sent = await p.send("+77011234567", "x");
    expect(sent.providerMsgId).toBe("77");
    expect(await p.status("77")).toBe("delivered");
  });

  it("network errors do not include the URL with apiKey", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed https://api.mobizon.kz/?apiKey=KEY");
    });
    const p = new MobizonProvider({ apiKey: "KEY", apiDomain: "api.mobizon.kz" }, fetchMock as typeof fetch);
    await expect(p.send("+77011234567", "x")).rejects.toThrow("mobizon: network error");
  });
});

describe("provider factory and allowlist", () => {
  it("switches off providers without credentials", () => {
    expect(createSmsProvider("console", { smsc: null, mobizon: null })?.name).toBe("console");
    expect(createSmsProvider("smsc", { smsc: null, mobizon: null })).toBeNull();
    expect(createSmsProvider("mobizon", { smsc: null, mobizon: null })).toBeNull();
  });

  it("normalizes the allowlist", () => {
    const allow = parseAllowlist("+77011234567, 8 777 123 45 67,garbage,");
    expect([...allow]).toEqual(["+77011234567", "+77771234567"]);
  });
});
