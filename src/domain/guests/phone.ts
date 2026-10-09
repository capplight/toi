/**
 * Phone numbers → E.164 for Kazakhstan (+7XXXXXXXXXX).
 * Logic follows `normPhone` from prototype/index.html: keep digits, drop a leading 7/8 country/trunk
 * prefix when 11+ digits, keep the 10-digit national number. Unlike the prototype (which cut input
 * while typing), extra or missing digits are rejected here.
 * Pure TS: no React, no DB (plan 11.1).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `+7${digits}`;
}

/** `+77011234567` → `+7 701 *** ** 67` (for logs and script output). */
export function maskPhone(e164: string): string {
  const national = normalizePhone(e164)?.slice(2);
  if (!national) return "***";
  return `+7 ${national.slice(0, 3)} *** ** ${national.slice(8, 10)}`;
}
