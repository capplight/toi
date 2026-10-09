import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Sentry beforeSend: personal data must not leave for Sentry (plan section 2 «Ошибки», 9).
 * - phone numbers are masked (`+77011234567`, `87011234567`, `+7 (701) 123-45-67` …);
 * - request bodies and cookies are removed.
 * Shared by server and browser configs.
 */
const PHONE_RE = /\+?[78][\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
export const PHONE_MASK = "[phone]";

export function maskPhones(text: string): string {
  return text.replace(PHONE_RE, PHONE_MASK);
}

function scrubDeep(value: unknown, depth: number): unknown {
  if (typeof value === "string") return maskPhones(value);
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1);
  return out;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
  }
  return scrubDeep(event, 0) as ErrorEvent;
}

/**
 * Sentry 11 replaced `sendDefaultPii` with `dataCollection`. This is the strict equivalent of
 * `sendDefaultPii: false` (brief Ф0 3.7): no user info, cookies, headers, bodies, query params,
 * DB query data or local variables.
 */
export const strictDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
};
