/**
 * CSV-export utility met BOM voor Excel-compatibiliteit.
 * Zet ID's om naar leesbare tekst, booleans naar Ja/Nee, etc.
 */

export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  const BOM = "\uFEFF";
  const header = columns.map((c) => escapeCsvField(c.label)).join(";");
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      if (typeof val === "boolean") return val ? "Ja" : "Nee";
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

function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
