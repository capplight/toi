import ExcelJS from "exceljs";
import type { PrintFamily } from "@/domain/print";
import type { PrintView } from "../print/queries";

/**
 * `tables.xlsx` (Ф10 brief §3): sheets «Үстелдер» (by table), «Қонақтар» (by name), «Санаттар» (by category).
 * Headers from `export.columns.*` in the interface language, the header row frozen, column widths by content,
 * numbers as numbers. No phones.
 */
export type ExportLabels = {
  sheets: { tables: string; guests: string; categories: string };
  columns: {
    table: string;
    name: string;
    seats: string;
    category: string;
    status: string;
    list: string;
    families: string;
    tables: string;
  };
  status: { yes: string; pending: string };
};

type Cell = string | number | null;

function addSheet(wb: ExcelJS.Workbook, name: string, header: string[], rows: Cell[][]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  header.forEach((h, i) => {
    const width = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(6, width + 2));
  });
  return ws;
}

export async function buildWorkbook(v: PrintView, l: ExportLabels): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Той";
  wb.created = new Date(0); // no clock in the file: the same data gives the same workbook
  const plan = v.plan;
  const familyRow = (f: PrintFamily): Cell[] => [
    f.tableNo,
    f.name,
    f.seats,
    f.categoryLabel,
    f.pending ? l.status.pending : l.status.yes,
    f.listLabel,
  ];
  const header = [
    l.columns.table,
    l.columns.name,
    l.columns.seats,
    l.columns.category,
    l.columns.status,
    l.columns.list,
  ];
  const byTable = plan ? [...plan.tables.flatMap((t) => t.families), ...plan.unplaced] : [];
  addSheet(wb, l.sheets.tables, header, byTable.map(familyRow));
  addSheet(wb, l.sheets.guests, header, (plan?.alpha ?? []).map(familyRow));
  addSheet(
    wb,
    l.sheets.categories,
    [l.columns.category, l.columns.families, l.columns.seats, l.columns.tables],
    (plan?.byCategory ?? []).map((c) => [c.label, c.families, c.seats, c.tables]),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
