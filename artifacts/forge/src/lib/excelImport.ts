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

/** All sheets in a workbook, each parsed the same way as parseSpreadsheet. */
export function parseWorkbook(file: File): Promise<Record<string, ImportRow[]>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const result: Record<string, ImportRow[]> = {};
        for (const name of workbook.SheetNames) {
          result[name] = XLSX.utils.sheet_to_json<ImportRow>(
            workbook.Sheets[name],
            { defval: "", raw: false },
          );
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Real production tracksheets mix at least two incompatible date formats in
 * the same workbook: US slash dates ("7/23/25", parseable natively) and
 * bare 8-digit DDMMYYYY ("27022026" -> 27 Feb 2026, "11052026" -> 11 May
 * 2026, NOT parseable natively and NOT MMDDYYYY -- days here go above 12).
 * Returns an ISO string, or null if the value can't be confidently parsed
 * (never silently produces a wrong date).
 */
export function parseLooseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    const day = Number(value.slice(0, 2));
    const month = Number(value.slice(2, 4));
    const year = Number(value.slice(4, 8));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
