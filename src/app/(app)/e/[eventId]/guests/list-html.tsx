import { html, raw, type SafeHtml } from "@/server/invite/html";
import { cn } from "@/ui/lib/cn";
import type { GuestStatus } from "@/ui/components/Display";
import { Icon, iconHtml, type IconName } from "@/ui/components/Icon";

/**
 * Server-rendered S1 pieces (RA Л1). The list of cards is one HTML string (escaped tagged templates of Ф5,
 * `src/server/invite/html.ts`) placed with `dangerouslySetInnerHTML`: React neither hydrates the cards nor
 * serialises them into the RSC payload as elements. Same markup and classes as `GuestCard` and `GroupHead`
 * (Display.tsx). Actions are `data-act` attributes handled by one delegated listener of `GuestsIsland`.
 * All texts come in already translated (content/messages); every value is escaped.
 */

const BADGE: Record<GuestStatus, { cls: string; icon: IconName }> = {
  notSent: { cls: "new", icon: "send" },
  noAnswer: { cls: "inv", icon: "clock" },
  yes: { cls: "yes", icon: "yes" },
  no: { cls: "no", icon: "no" },
};

export type StaticCardText = {
  /** Full accessible name of the card button (`guests.card.a11y`). */
  a11y: string;
  badge: string;
  /** «≈ 4 орын» for not answered; undefined for «yes» / «no». */
  seats?: string;
  table?: string;
  phoneIcon: string;
  send: string;
  remind: string;
  opensWhatsApp: string;
  sentAgo?: string;
};

export type StaticCard = {
  id: string;
  name: string;
  status: GuestStatus;
  hasPhone: boolean;
  flash: boolean;
  /** wa.me chat link; the island swaps in the full text on the first touch / focus / hover. */
  waBase: string;
  text: StaticCardText;
};

export type StaticGroup = { id: string; label: string; code: string | null; count: string; cards: StaticCard[] };

function cardHtml(c: StaticCard): SafeHtml {
  const b = BADGE[c.status];
  const wa = (act: "send" | "remind") =>
    html`<a
      href="${c.waBase}"
      target="_blank"
      rel="noopener noreferrer"
      class="${cn("btn", act === "send" ? "wa" : "wa-outline", "row")}"
      data-act="${act}"
      >${raw(iconHtml(act === "send" ? "wa" : "bell"))}${act === "send" ? c.text.send : c.text.remind}<span
        class="sr-only"
        >(${c.text.opensWhatsApp})</span
      ></a
    >`;
  const act =
    c.status === "notSent"
      ? html`<div class="act">${wa("send")}</div>`
      : c.status === "noAnswer"
        ? html`<div class="act">
            ${wa("remind")}${c.text.sentAgo ? html`<span class="ago">${c.text.sentAgo}</span>` : ""}
          </div>`
        : "";
  const phone = c.hasPhone
    ? html`<span class="phone" title="${c.text.phoneIcon}"
        >${raw(iconHtml("phone", "sm"))}<span class="sr-only">${c.text.phoneIcon}</span></span
      >`
    : "";
  return html`<div id="g-${c.id}" class="${cn("guest", "desktop", c.flash && "flash")}" data-gid="${c.id}">
    <button type="button" aria-label="${c.text.a11y}" class="card-hit" data-act="open"></button>
    <div class="name">${c.name}</div>
    ${phone}
    <div class="row2" aria-hidden="true">
      <span class="badge ${b.cls}">${raw(iconHtml(b.icon))}${c.text.badge}</span
      >${c.text.seats ? html`<span>${c.text.seats}</span>` : ""}${c.text.table ? html`<span class="tbl">${c.text.table}</span>` : ""}
    </div>
    ${act}
    <div class="pending-slot" data-slot="pending"></div>
  </div>`;
}

/** Category groups with their cards (`GroupHead` + `GuestCard` markup) as one HTML string. */
export function guestListHtml(groups: StaticGroup[]): string {
  return html`${groups.map(
    (g) =>
      html`<section aria-label="${g.label}" data-cat="${g.id}">
        <div class="group-head">
          <h3 class="t-group">
            <span class="sw" style="background:var(--cat-${g.code ?? "baska"})" aria-hidden="true"></span>${g.label}
          </h3>
          <span class="t-body t-muted">${g.count}</span>
        </div>
        ${g.cards.map(cardHtml)}
      </section>`,
  )}`.value;
}

/** `CounterTile` markup: a filter toggle (`aria-pressed` is kept by the island). */
export function StaticCounter({ kind, filter, text }: { kind: "yes" | "inv" | "no"; filter: string; text: string }) {
  const icon: IconName = kind === "yes" ? "yes" : kind === "inv" ? "clock" : "no";
  const [first = "", ...rest] = text.split("\n");
  const m = first.match(/^(\D*?)(\d[\d\s]*)(.*)$/);
  return (
    <button type="button" className={cn("counter", kind)} aria-pressed="false" data-act="filter" data-filter={filter}>
      <Icon name={icon} />
      <span className="val">
        {m ? (
          <>
            {m[1]}
            <b className="t-stat">{m[2]!.trim()}</b> {m[3]!.trim()}
          </>
        ) : (
          first
        )}
      </span>
      {rest.length > 0 && <span className="lbl">{rest.join(" ")}</span>}
    </button>
  );
}
