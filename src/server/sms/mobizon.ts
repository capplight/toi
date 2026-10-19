import type { MobizonConfig } from "@/server/env";
import { digitsOnly, postForm, SmsProviderError, type SendResult, type SmsProvider, type SmsStatus } from "./types";

/**
 * Mobizon REST API (api.mobizon.kz).
 * Docs: https://mobizon.kz/help/api-docs/message (SendSmsMessage, GetSMSStatus),
 * statuses: https://mobizon.kz/help/api-docs/other#SmsStatus.
 * The API key goes in the query string as the docs require; the URL is never logged or put into errors.
 */
type ApiResponse<T> = { code?: number; data?: T; message?: string };
type SendData = { campaignId?: string | number; messageId?: string | number; status?: number };
type StatusItem = { id?: string | number; status?: string };

export function mapMobizonStatus(status: string | undefined): SmsStatus {
  switch (status) {
    case "NEW":
    case "ENQUEUD":
      return "queued";
    case "ACCEPTD":
    case "PDLIVRD":
      return "sent";
    case "DELIVRD":
      return "delivered";
    case "UNDELIV":
    case "REJECTD":
    case "EXPIRED":
    case "DELETED":
      return "failed";
    default:
      return "unknown";
  }
}

export class MobizonProvider implements SmsProvider {
  readonly name = "mobizon" as const;

  constructor(
    private readonly config: MobizonConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(method: string): string {
    const q = new URLSearchParams({ output: "json", api: "v1", apiKey: this.config.apiKey });
    return `https://${this.config.apiDomain}/service/message/${method}?${q.toString()}`;
  }

  async send(to: string, text: string): Promise<SendResult> {
    const res = (await postForm(
      "mobizon",
      this.url("sendsmsmessage"),
      { recipient: digitsOnly(to), text },
      this.fetchImpl,
    )) as ApiResponse<SendData>;
    if (res.code !== 0 || res.data?.messageId === undefined) {
      throw new SmsProviderError("mobizon", `send failed, code ${res.code ?? "?"}: ${res.message ?? ""}`);
    }
    return { providerMsgId: String(res.data.messageId), status: "queued", cost: null };
  }

  async status(providerMsgId: string): Promise<SmsStatus> {
    const res = (await postForm(
      "mobizon",
      this.url("getsmsstatus"),
      { "ids[0]": providerMsgId },
      this.fetchImpl,
    )) as ApiResponse<StatusItem[]>;
    if (res.code !== 0) {
      throw new SmsProviderError("mobizon", `status failed, code ${res.code ?? "?"}: ${res.message ?? ""}`);
    }
    const item = res.data?.find((d) => String(d.id) === providerMsgId);
    return mapMobizonStatus(item?.status);
  }
}
