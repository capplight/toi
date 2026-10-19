export type SmsStatus = "queued" | "sent" | "delivered" | "failed" | "unknown";

export type SendResult = {
  providerMsgId: string;
  status: SmsStatus;
  /** Cost in KZT if the provider reports it in the send response, otherwise null. */
  cost: number | null;
};

/**
 * SMS gateway (plan 3.6). Login logic, limits and sms_log are Ф2.
 * `to` is E.164 (`+77011234567`).
 * `status` also takes `to`: SMSC.kz status.php requires the phone together with the message id.
 */
export interface SmsProvider {
  readonly name: "console" | "smsc" | "mobizon";
  send(to: string, text: string): Promise<SendResult>;
  status(providerMsgId: string, to: string): Promise<SmsStatus>;
}

export class SmsProviderError extends Error {
  constructor(provider: string, detail: string) {
    // Detail never contains credentials or the full phone number.
    super(`${provider}: ${detail}`);
    this.name = "SmsProviderError";
  }
}

/** POST x-www-form-urlencoded and parse JSON. Network errors are re-thrown without the URL. */
export async function postForm(
  provider: string,
  url: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SmsProviderError(provider, "network error");
  }
  if (!res.ok) throw new SmsProviderError(provider, `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new SmsProviderError(provider, "response is not JSON");
  }
}

/** `+77011234567` → `77011234567` */
export function digitsOnly(e164: string): string {
  return e164.replace(/\D/g, "");
}
