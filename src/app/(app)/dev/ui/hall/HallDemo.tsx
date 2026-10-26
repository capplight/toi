"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AppShell, type ShellActions } from "@/ui/components/AppShell";
import { Segment } from "@/ui/components/Controls";
import { Banner, Chips, LinkRow, LinkRows, StatusChip, SummaryLine } from "@/ui/components/Display";
import { showToast } from "@/ui/components/Toast";
import { HallLegend, HallMap } from "@/ui/hall/HallMap";
import { categoryCodes, demoHall, sampleEvent } from "../demo";

/**
 * Demo «Зал» (360×740 / 320×640 check of B1): the hall of the fixture with 14 tables, so that there are
 * overflowing tables, a duplicate pair and unplaced families at once. All numbers come from the Ф7a engine.
 */
export function HallDemo({ actions }: { actions: ShellActions }) {
  const t = useTranslations();
  const [view, setView] = useState<"map" | "list">("map");
  const { stats, pairs, unplacedSeats } = useMemo(() => demoHall({ tables: 14 }), []);
  const used = stats.tables.reduce((a, x) => a + x.used, 0) + unplacedSeats;
  const capacity = stats.tables.reduce((a, x) => a + x.capacity, 0);
  const free = capacity - used;
  const tablesNeeded = Math.ceil(unplacedSeats / 12);
  useEffect(() => {
    showToast({
      message: t("hall.move.toast", { number: 16, name: "Сапарбаевтар (бас құда) отбасы" }),
      undoLabel: t("common.actions.undo"),
      onUndo: () => {},
    });
  }, [t]);
  return (
    <AppShell
      event={{ id: "demo", title: sampleEvent.title, dateLine: "15 қараша, 18:00" }}
      user={{
        name: "Серік",
        roleLabel: t("roles.father"),
        permissionLabel: t("roles.permission.listAndSeating"),
        initial: "С",
      }}
      isOwner
      section="hall"
      canManageBudget
      hallAttention
      title={t("hall.map.title")}
      actions={actions}
      topRight={
        <Segment
          compact
          value={view}
          onChange={setView}
          label={t("hall.map.view.label")}
          options={[
            { value: "map", label: t("hall.map.view.map"), icon: "grid" },
            { value: "list", label: t("hall.map.view.list"), icon: "list" },
          ]}
        />
      }
    >
      <div className="page">
        <div style={{ display: "grid", gap: 8 }}>
          <SummaryLine
            line={
              free >= 0
                ? t("hall.map.summary.line", { used, capacity, free })
                : t("hall.map.summary.over", { missing: -free })
            }
            restaurant={t("hall.map.summary.restaurantShort", { people: used, tables: stats.usedTables })}
          >
            <div className="sub">{t("hall.map.meta", { columns: 4, tables: 14, seats: 12 })}</div>
            <div className="resto">{t("hall.map.summary.restaurant", { people: used, tables: stats.usedTables })}</div>
          </SummaryLine>
          {unplacedSeats > 0 && (
            <Banner
              kind="unplaced"
              title={t("hall.map.banners.unplaced", { people: unplacedSeats, tables: tablesNeeded })}
              onClick={() => {}}
              live
            />
          )}
          <Chips>
            {stats.overfull.length > 0 && (
              <StatusChip
                kind="error"
                label={t("hall.map.chips.overflow", { count: stats.overfull.length })}
                a11yLabel={t("hall.map.chips.overflowA11y", { count: stats.overfull.length })}
              />
            )}
            {pairs.length > 0 && (
              <StatusChip
                kind="dup"
                label={t("hall.map.chips.dups", { count: pairs.length * 2 })}
                a11yLabel={t("hall.map.chips.dupsA11y", { count: pairs.length * 2 })}
              />
            )}
          </Chips>
          <div className="stage" data-testid="hall-stage">
            <HallMap
              stats={stats}
              columns={4}
              categoryCodes={categoryCodes}
              eventKind={sampleEvent.kind}
              eventTitle={sampleEvent.title}
            />
            <HallLegend />
          </div>
        </div>
        <div className="aside" style={{ display: "grid", gap: 12 }}>
          <LinkRows>
            <LinkRow href="#" icon="order" title={t("hall.map.links.order")} />
            <LinkRow href="#" icon="history" title={t("hall.map.links.history", { count: 6 })} />
            <LinkRow href="#" icon="sliders" title={t("hall.map.links.setup")} />
          </LinkRows>
        </div>
      </div>
    </AppShell>
  );
}
