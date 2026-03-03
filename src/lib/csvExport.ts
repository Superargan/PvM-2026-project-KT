/**
 * Export utility – ondersteunt CSV (met BOM voor Excel) én XLSX/XLS.
 * Zet booleans om naar Ja/Nee.
 */
import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
}

/** Centrale exportfunctie die zowel CSV als XLSX aankan. */
export function downloadExport(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, any>[],
  format: ExportFormat = "csv",
) {
  // Normalize booleans
  const normalizedRows = rows.map((row) => {
    const out: Record<string, any> = {};
    for (const c of columns) {
      const val = row[c.key];
      if (val === null || val === undefined) out[c.label] = "";
      else if (typeof val === "boolean") out[c.label] = val ? "Ja" : "Nee";
      else out[c.label] = val;
    }
    return out;
  });

  if (format === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(normalizedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename.replace(/\.\w+$/, "") + ".xlsx");
    return;
  }

  // CSV with BOM
  const BOM = "\uFEFF";
  const header = columns.map((c) => escapeCsvField(c.label)).join(";");
  const body = normalizedRows.map((row) =>
    columns.map((c) => {
      const val = row[c.label];
      if (val === null || val === undefined || val === "") return "";
      return escapeCsvField(String(val));
    }).join(";")
  );

  const csv = BOM + [header, ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Backward-compatible alias */
export function downloadCsv(filename: string, columns: ExportColumn[], rows: Record<string, any>[]) {
  downloadExport(filename, columns, rows, "csv");
}

function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
