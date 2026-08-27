function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportToCSV(entries: unknown[], fileName = "koku-export.csv") {
  const Papa = (await import("papaparse")).default;
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

export async function exportToPDF(
  rows: Array<Record<string, string | number | null | undefined>>,
  fileName = "koku-export.pdf",
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
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

type SheetCell = string | number | null | undefined;

interface WorkbookSheet {
  name: string;
  rows: SheetCell[][];
}

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const textEncoder = new TextEncoder();
const crc32Table = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let name = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function cellXml(value: SheetCell, rowIndex: number, colIndex: number) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
}

function worksheetXml(rows: SheetCell[][]) {
  const sheetData = rows
    .map((row, rowIndex) => (
      `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => cellXml(cell, rowIndex, colIndex)).join("")}</row>`
    ))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

function workbookXml(sheets: WorkbookSheet[]) {
  const sheetNodes = sheets
    .map((sheet, index) => (
      `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    ))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetNodes}</sheets>
</workbook>`;
}

function workbookRelsXml(sheets: WorkbookSheet[]) {
  const sheetRels = sheets
    .map((_, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}</Relationships>`;
}

function contentTypesXml(sheets: WorkbookSheet[]) {
  const sheetOverrides = sheets
    .map((_, index) => (
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime() {
  const date = new Date();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function createZip(files: Array<{ name: string; data: string }>) {
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  const { time, date } = getDosDateTime();
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.name);
    const dataBytes = textEncoder.encode(file.data);
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    parts.push(localHeader, dataBytes);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((size, part) => size + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  const zipParts = [...parts, ...centralDirectory, end].map((part) =>
    part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
  );

  return new Blob(zipParts, { type: XLSX_MIME_TYPE });
}

function createWorkbookBlob(sheets: WorkbookSheet[]) {
  const files = [
    { name: "[Content_Types].xml", data: contentTypesXml(sheets) },
    { name: "_rels/.rels", data: rootRelsXml() },
    { name: "xl/workbook.xml", data: workbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml(sheets) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: worksheetXml(sheet.rows),
    })),
  ];

  return createZip(files);
}

export async function exportToXLSX(entries: XLSXEntry[], fileName = "koku-export.xlsx", timeFormat: "12h" | "24h" = "24h") {
  const hour12 = timeFormat === "12h";
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
      startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12 }),
      end
        ? `${crossDay ? end.toLocaleDateString() + " " : ""}${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12 })}`
        : "",
      ((e.durationSec ?? 0) / 3600).toFixed(2),
      e.title,
      e.projectName ?? "Unassigned",
      e.categoryName ?? "",
      e.tags.join(", "),
      e.notes ?? "",
      new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12 }),
    ];
  });
  const rawSheetRows = [rawHeaders, ...rawRows];

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
  downloadBlob(createWorkbookBlob([
    { name: "Raw Entries", rows: rawSheetRows },
    { name: "Summary", rows: summaryRows },
    { name: "By Project", rows: projectRows },
    { name: "By Day", rows: dayRows },
  ]), fileName);
}
