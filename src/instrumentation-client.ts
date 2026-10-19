import * as Sentry from "@sentry/nextjs";
import { scrubEvent, strictDataCollection } from "@/sentry.scrub";

// Browser Sentry: enabled only when NEXT_PUBLIC_SENTRY_DSN is set at build time.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: strictDataCollection,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : undefined;
