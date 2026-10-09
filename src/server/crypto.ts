import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Random token in base62 (plan 9): 16 bytes → exactly 22 characters (~128 bits).
 * Used for login links, guest and door tokens.
 */
export function randomToken(bytes = 16): string {
  let n = BigInt(`0x${randomBytes(bytes).toString("hex")}`);
  const len = Math.ceil((bytes * 8) / Math.log2(62));
  let out = "";
  for (let i = 0; i < len; i++) {
    out = BASE62[Number(n % 62n)]! + out;
    n /= 62n;
  }
  return out;
}

/** Session token: 32 random bytes, base64url (only its sha256 is stored). */
export function sessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** 6-digit login code from a CSPRNG (plan 9). */
export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
