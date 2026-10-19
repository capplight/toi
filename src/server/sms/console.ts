import { randomUUID } from "node:crypto";
import { maskPhone } from "@/domain/guests/phone";
import type { SendResult, SmsProvider, SmsStatus } from "./types";

/** Local/preview provider: prints the message to the server log instead of sending it. */
export class ConsoleProvider implements SmsProvider {
  readonly name = "console" as const;

  async send(to: string, text: string): Promise<SendResult> {
    const providerMsgId = `console-${randomUUID()}`;
    console.info(`[sms:console] to ${maskPhone(to)} id ${providerMsgId}\n${text}`);
    return { providerMsgId, status: "delivered", cost: 0 };
  }

  async status(): Promise<SmsStatus> {
    return "delivered";
  }
}
