import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToCSV(entries: unknown[], fileName = "koku-export.csv") {
  const csv = Papa.unparse(entries);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), fileName);
}

export function exportToJSON(data: unknown, fileName = "koku-export.json") {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8;",
    }),
    fileName,
  );
}

export function exportToPDF(
  rows: Array<Record<string, string | number | null | undefined>>,
  fileName = "koku-export.pdf",
) {
  const pdf = new jsPDF({ orientation: "landscape" });
  const headers = rows.length ? Object.keys(rows[0]) : [];

  pdf.setFontSize(18);
  pdf.text("Koku Report Export", 14, 18);
  pdf.setFontSize(10);
  pdf.text(new Date().toLocaleString(), 14, 26);

  autoTable(pdf, {
    startY: 34,
    head: [headers],
    body: rows.map((row) => headers.map((header) => String(row[header] ?? ""))),
    styles: {
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [192, 57, 43],
    },
  });

  pdf.save(fileName);
}

// ── XLSX multi-sheet export ───────────────────────────────────────────────────

export interface XLSXEntry {
  title: string;
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
  projectName?: string | null;
  categoryName?: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
}

function colWidths(keys: string[]) {
  return keys.map((k) => ({ wch: Math.max(k.length + 2, 14) }));
}

export function exportToXLSX(entries: XLSXEntry[], fileName = "koku-export.xlsx") {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Raw Entries ──────────────────────────────────────────────────
  const rawHeaders = [
    "Date", "Start", "End", "Duration (h)", "Title",
    "Project", "Category", "Tags", "Notes", "Recorded At",
  ];
  const rawRows = entries.map((e) => {
    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : null;
    const endDate = end ? new Date(end) : null;
    const startDate = new Date(start);
    const crossDay =
      endDate &&
      (endDate.getDate() !== startDate.getDate() ||
        endDate.getMonth() !== startDate.getMonth());

    return [
      startDate.toLocaleDateString(),
      startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      end
        ? `${crossDay ? end.toLocaleDateString() + " " : ""}${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "",
      ((e.durationSec ?? 0) / 3600).toFixed(2),
      e.title,
      e.projectName ?? "Unassigned",
      e.categoryName ?? "",
      e.tags.join(", "),
      e.notes ?? "",
      new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ];
  });
  const wsRaw = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
  wsRaw["!cols"] = colWidths(rawHeaders);
  XLSX.utils.book_append_sheet(wb, wsRaw, "Raw Entries");

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  const totalSec = entries.reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const totalHours = (totalSec / 3600).toFixed(2);
  const uniqueDays = new Set(entries.map((e) => new Date(e.startAt).toLocaleDateString())).size;
  const avgHours = uniqueDays > 0 ? (Number(totalHours) / uniqueDays).toFixed(2) : "0.00";
  const dates = entries.map((e) => e.startAt).sort();
  const summaryRows = [
    ["Metric", "Value"],
    ["Total entries", entries.length],
    ["Total hours", totalHours],
    ["Unique days tracked", uniqueDays],
    ["Average hours / day", avgHours],
    ["Date range", dates.length ? `${new Date(dates[0]).toLocaleDateString()} – ${new Date(dates[dates.length - 1]).toLocaleDateString()}` : "—"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 24 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 3: By Project ───────────────────────────────────────────────────
  const projectMap = new Map<string, { hours: number; count: number }>();
  for (const e of entries) {
    const key = e.projectName ?? "Unassigned";
    const cur = projectMap.get(key) ?? { hours: 0, count: 0 };
    cur.hours += (e.durationSec ?? 0) / 3600;
    cur.count += 1;
    projectMap.set(key, cur);
  }
  const projectRows = [["Project", "Hours", "% of Total", "Entries"]];
  const total = Number(totalHours) || 1;
  Array.from(projectMap.entries())
    .sort((a, b) => b[1].hours - a[1].hours)
    .forEach(([name, { hours, count }]) => {
      projectRows.push([
        name,
        hours.toFixed(2),
        ((hours / total) * 100).toFixed(1) + "%",
        String(count),
      ]);
    });
  const wsProject = XLSX.utils.aoa_to_sheet(projectRows);
  wsProject["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsProject, "By Project");

  // ── Sheet 4: By Day ───────────────────────────────────────────────────────
  const dayMap = new Map<string, { hours: number; count: number }>();
  for (const e of entries) {
    const key = new Date(e.startAt).toLocaleDateString();
    const cur = dayMap.get(key) ?? { hours: 0, count: 0 };
    cur.hours += (e.durationSec ?? 0) / 3600;
    cur.count += 1;
    dayMap.set(key, cur);
  }
  const dayRows = [["Date", "Total Hours", "Entries"]];
  Array.from(dayMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .forEach(([date, { hours, count }]) => {
      dayRows.push([date, hours.toFixed(2), String(count)]);
    });
  const wsDay = XLSX.utils.aoa_to_sheet(dayRows);
  wsDay["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsDay, "By Day");

  XLSX.writeFile(wb, fileName);
}
