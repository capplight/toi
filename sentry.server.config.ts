import * as Sentry from "@sentry/nextjs";
import { scrubEvent, strictDataCollection } from "@/sentry.scrub";

// Enabled only when SENTRY_DSN is set (optional module).
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: strictDataCollection,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}
