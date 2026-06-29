import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
