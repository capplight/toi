import type { Metadata } from "next";
import { otpStatusAction, requestOtpAction, verifyOtpAction } from "@/server/actions/auth";
import { env } from "@/server/env";
import { AuthFrame } from "../AuthFrame";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Plan 6.1 flows 2–3, mockup 09 (`#sms`, `#code`). */
export default async function LoginPage() {
  return (
    <AuthFrame>
      <LoginForm
        consoleMode={env().SMS_PROVIDER === "console"}
        actions={{ requestOtp: requestOtpAction, verifyOtp: verifyOtpAction, otpStatus: otpStatusAction }}
      />
    </AuthFrame>
  );
}
