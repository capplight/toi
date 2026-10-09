import type { SmscConfig } from "@/server/env";
import { digitsOnly, postForm, SmsProviderError, type SendResult, type SmsProvider, type SmsStatus } from "./types";

/**
 * SMSC.kz HTTP API.
 * Docs: https://smsc.kz/api/http/ (send: /sys/send.php, status: /sys/status.php; fmt=3 → JSON).
 * POST is used so that credentials never appear in URLs/access logs.
 * [ПРОВЕРИТЬ] with a real account: SMSC_PASSWORD may be the account password or an API key
 * (docs mention `apikey` as an alternative to login+psw); status code 4 meaning.
 */
const BASE = "https://smsc.kz/sys";

type SendResponse = { id?: number; cnt?: number; cost?: string | number; error?: string; error_code?: number };
type StatusResponse = { status?: number; err?: number; error?: string; error_code?: number };

/** SMSC status codes → common status. */
export function mapSmscStatus(code: number | undefined): SmsStatus {
  switch (code) {
    case -1: // waiting to be sent
    case -2: // being processed
      return "queued";
    case 0: // handed to the operator
      return "sent";
    case 1: // delivered
    case 2: // read
    case 4: // link clicked [ПРОВЕРИТЬ]
      return "delivered";
    case 3: // expired
    case 20: // cannot be delivered
    case 22: // wrong number
    case 23: // prohibited
    case 24: // insufficient funds
    case 25: // unreachable number
      return "failed";
    default: // -3 not found, unknown codes
      return "unknown";
  }
}

export class SmscKzProvider implements SmsProvider {
  readonly name = "smsc" as const;

  constructor(
    private readonly config: SmscConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private auth(): Record<string, string> {
    return { login: this.config.login, psw: this.config.password };
  }

  async send(to: string, text: string): Promise<SendResult> {
    const form: Record<string, string> = {
      ...this.auth(),
      phones: digitsOnly(to),
      mes: text,
      fmt: "3",
      charset: "utf-8",
      cost: "2", // return id + cost
    };
    if (this.config.sender) form.sender = this.config.sender;

    const data = (await postForm("smsc", `${BASE}/send.php`, form, this.fetchImpl)) as SendResponse;
    if (data.error || data.id === undefined) {
      throw new SmsProviderError("smsc", `send failed, error_code ${data.error_code ?? "?"}: ${data.error ?? "no id"}`);
    }
    const cost = data.cost === undefined ? null : Number(data.cost);
    return { providerMsgId: String(data.id), status: "queued", cost: Number.isFinite(cost) ? cost : null };
  }

  async status(providerMsgId: string, to: string): Promise<SmsStatus> {
    const form = { ...this.auth(), phone: digitsOnly(to), id: providerMsgId, fmt: "3", charset: "utf-8" };
    const data = (await postForm("smsc", `${BASE}/status.php`, form, this.fetchImpl)) as StatusResponse;
    if (data.error) {
      throw new SmsProviderError("smsc", `status failed, error_code ${data.error_code ?? "?"}: ${data.error}`);
    }
    return mapSmscStatus(data.status);
  }
}
