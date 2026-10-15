import { getLocale, getTranslations } from "next-intl/server";
import { asLocale } from "@/domain/format";
import type { PrintFamily } from "@/domain/print";
import { db } from "@/server/db";
import { printView } from "@/server/print/queries";
import { PrintHallMap } from "@/ui/hall/PrintHallMap";
import { memberOr404 } from "../../guests/data";
import { PrintActions } from "./PrintActions";

/**
 * «Отырғызу жоспары» for print (Ф10 brief §2, DESIGN 8.22, after the founder's sample): header, hall map coloured by
 * category with a legend, by tables (with an empty «Келді» box), by categories, by name (paper copy for the door
 * helper), without a seat. A4 portrait; «Сохранить как PDF» from the browser — no server PDF.
 */
export const dynamic = "force-dynamic";

const seatsText = (f: PrintFamily) => (f.pending ? `~${f.seats}` : String(f.seats));

export default async function PrintTablesPage({ params }: PageProps<"/e/[eventId]/print/tables">) {
  const { eventId } = await params;
  const m = await memberOr404(eventId);
  const locale = asLocale(await getLocale());
  const v = await printView(db(), m.user, eventId, locale);
  const t = await getTranslations("print");
  const th = await getTranslations("hall");
  const te = await getTranslations("export");
  const plan = v.plan;
  const codes = Object.fromEntries((plan?.byCategory ?? []).map((c) => [c.categoryId, c.code]));
  // page numbers in the printed margin (`@page` margin boxes, Chrome 131+); the text comes from print.pageOf
  const [beforePage, rest = ""] = t.raw("pageOf").split("{page}") as [string, string?];
  const [between, after = ""] = rest.split("{pages}");
  const css = (s: string) => JSON.stringify(s ?? "");
  const pageCss = `@page { @bottom-center { content: ${css(beforePage)} counter(page) ${css(between ?? "")} counter(pages) ${css(after)}; } }`;
  const seated = plan ? plan.tables.some((x) => x.families.length > 0) : false;

  return (
    <article className="print" data-testid="print">
      <style>{pageCss}</style>
      <header className="pr-head">
        <div>
          <h1>{t("title")}</h1>
          <p className="pr-sub">
            {t("header", { eventTitle: v.event.title, date: v.event.dateLine, venue: v.event.venue ?? "" })}
          </p>
          <p className="pr-gen">{t("generatedAt", { datetime: v.generatedAt })}</p>
        </div>
        <PrintActions
          printLabel={t("button")}
          exportLabel={te("button")}
          exportHref={`/e/${eventId}/export/tables.xlsx`}
        />
      </header>

      {!plan || !seated ? (
        <p className="pr-empty">{t("empty")}</p>
      ) : (
        <>
          <section className="pr-page pr-map" aria-labelledby="pr-map">
            <h2 id="pr-map">{t("map.title")}</h2>
            <PrintHallMap
              plan={plan}
              codes={codes}
              labels={{
                tor: th("map.tor"),
                entrance: th("map.entrance"),
                couple: th("map.coupleTable", { kind: v.event.kind }),
                total: (taken, capacity) => t("table.total", { taken, capacity }),
                a11y: th("map.a11y"),
              }}
            />
            <div className="pr-legend" aria-label={t("legend.title")}>
              <b>{t("legend.title")}:</b>
              {plan.byCategory.map((c) => (
                <span key={c.categoryId}>
                  <i style={{ background: `var(--cat-${c.code})` }} aria-hidden="true" />
                  {c.label} · {c.seats}
                </span>
              ))}
              <span>
                <i className="free" aria-hidden="true" />
                {t("legend.free")}
              </span>
              <span>
                <i className="mixed" aria-hidden="true" />
                {t("mixed")}
              </span>
              <span>{t("pendingMark")}</span>
            </div>
          </section>

          <section className="pr-page" aria-labelledby="pr-tables">
            <h2 id="pr-tables">{t("byTables.title")}</h2>
            <div className="pr-tables">
              {plan.tables
                .filter((x) => x.families.length > 0)
                .map((x) => (
                  <div key={x.no} className="pr-table">
                    <h3>
                      {t("table.title", { number: x.no })}
                      <span className={x.missing > 0 ? "over" : undefined}>
                        {t("table.total", { taken: x.used, capacity: x.capacity })}
                      </span>
                    </h3>
                    <p className="pr-cat">
                      {plan.byCategory.find((c) => c.categoryId === x.mainCategoryId)?.label}
                      {x.mixed && <em> · {t("mixed")}</em>}
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>{t("table.colFamily")}</th>
                          <th className="n">{t("table.colSeats")}</th>
                          <th className="box">{t("table.colArrived")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {x.families.map((f) => (
                          <tr key={f.id}>
                            <td>{f.name}</td>
                            <td className="n">{seatsText(f)}</td>
                            <td className="box">
                              <i aria-hidden="true" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>
          </section>

          <section className="pr-page" aria-labelledby="pr-cats">
            <h2 id="pr-cats">{t("byCategory.title")}</h2>
            {plan.byCategory.map((c) => (
              <div key={c.categoryId} className="pr-group">
                <h3>
                  <i style={{ background: `var(--cat-${c.code})` }} aria-hidden="true" />
                  {c.label}
                </h3>
                <p className="pr-cat">
                  {t("byCategory.meta", { families: c.families, seats: c.seats, tables: c.tables || "—" })}
                </p>
                <table>
                  <tbody>
                    {c.list.map((f) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td className="n">{seatsText(f)}</td>
                        <td className="n">{f.tableNo ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <section className="pr-page" aria-labelledby="pr-alpha">
            <h2 id="pr-alpha">{t("alpha.title")}</h2>
            <ol className="pr-alpha">
              {plan.alpha.map((f) => (
                <li key={f.id}>
                  <span>{f.name}</span>
                  <b>{f.tableNo ?? "—"}</b>
                </li>
              ))}
            </ol>
          </section>

          {plan.unplaced.length > 0 && (
            <section className="pr-page" aria-labelledby="pr-unplaced">
              <h2 id="pr-unplaced">{th("unplaced.title")}</h2>
              <table>
                <tbody>
                  {plan.unplaced.map((f) => (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.categoryLabel}</td>
                      <td className="n">{seatsText(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </article>
  );
}
