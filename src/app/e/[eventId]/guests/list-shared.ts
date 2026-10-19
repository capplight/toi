import type { GuestLike } from "@/domain/guests/status";
import type { GuestView } from "@/server/guests/queries";

/**
 * Pure helpers of S1 shared by the server-rendered list and the client island (RA Л1). No "use client": a
 * server component cannot call a function exported from a client module.
 */
export type Filter = "yes" | "noAnswer" | "no" | null;

export const asLike = (g: GuestView): GuestLike & { id: string } => ({
  id: g.id,
  name: g.name,
  rsvp: g.rsvp,
  expected: g.expected,
  confirmed: g.confirmed,
  sentAt: g.sentAt ? new Date(g.sentAt) : null,
});

/** wa.me chat without text — the href until the full link is resolved on the first touch / focus / hover. */
export const chatUrl = (phone: string | null) => `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}`;
