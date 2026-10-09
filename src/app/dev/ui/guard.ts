/** /dev/ui is for local and preview only — 404 in production (brief Ф1 3.5, criterion 8). */
export function devUiAllowed(): boolean {
  return process.env.VERCEL_ENV !== "production" && process.env.APP_ENV !== "production";
}
