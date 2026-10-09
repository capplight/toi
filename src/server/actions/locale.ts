"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LOCALE_COOKIE, locales } from "@/i18n/config";

const input = z.object({ locale: z.enum(locales) });

/**
 * Temporary Ф0 language switch (check that kk/ru wiring works).
 * The final language change (event menu «⋯», decision Д3) is Ф1.
 * Public action: no authz needed (only sets the visitor's own language cookie).
 */
export async function setLocale(formData: FormData): Promise<void> {
  const parsed = input.safeParse({ locale: formData.get("locale") });
  if (!parsed.success) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/");
}
