import * as XLSX from "xlsx";

/** One parsed spreadsheet row, keyed by its original header text. */
export type ImportRow = Record<string, string>;

/**
 * Parses the first sheet of an .xlsx/.xls/.csv file into rows keyed by
 * header. Column lookups elsewhere should go through `getField` (below)
 * rather than indexing this object directly, since real client
 * spreadsheets vary in header capitalization/spacing/naming.
 */
export function parseSpreadsheet(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) return resolve([]);
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, {
          defval: "",
          raw: false,
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Looks up a field on a parsed row by trying each of `candidates` against
 * the row's actual headers, case-/whitespace-insensitively. Real client
 * spreadsheets label the same concept differently ("Shot Name" vs "Shot"
 * vs "shot_name") -- this is the one seam to extend once we see the
 * user's real files, rather than requiring an exact header match.
 */
export function getField(row: ImportRow, candidates: string[]): string {
  const normalizedKeys = Object.keys(row).map((k) => ({
    key: k,
    norm: k.trim().toLowerCase().replace(/[\s_-]+/g, ""),
  }));
  for (const candidate of candidates) {
    const normCandidate = candidate.toLowerCase().replace(/[\s_-]+/g, "");
    const match = normalizedKeys.find((k) => k.norm === normCandidate);
    if (match) return String(row[match.key] ?? "").trim();
  }
  return "";
}
