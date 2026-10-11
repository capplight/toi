import data from "../../../content/invitation-presets.json" with { type: "json" };

/**
 * Ready invitation texts for the wizard step «Шақыру мәтіні» (decision А6, Ф3 review П1). The texts belong to the
 * content lead and live in `content/invitation-presets.json` (`{ version, kk: { kind: [{ id, text }] }, ru: … }`,
 * CONTENT_REVIEW §8), checked by `scripts/check-presets.ts` (part of `pnpm check:messages`): plain text, no names,
 * no `[…]` samples. Names are shown on the invitation from `events.title`, never inside the text.
 */
export type PresetKind = "uilenu_toi" | "kyz_uzatu" | "sundet" | "besik" | "merey" | "other";
export type Preset = { id: string; text: string };

const file = data as { version: number; kk: Record<string, Preset[]>; ru: Record<string, Preset[]> };

export function presets(kind: PresetKind, lang: "kk" | "ru"): Preset[] {
  return file[lang][kind] ?? [];
}

/**
 * A sample in square brackets is left (from an old template or typed by the owner). The text goes to every guest,
 * so it cannot be saved (А6): the wizard text and review steps, `createEvent` and `updateEvent` refuse it.
 */
export function hasPlaceholder(text: string | null | undefined): boolean {
  return /[[\]]/.test(text ?? "");
}
