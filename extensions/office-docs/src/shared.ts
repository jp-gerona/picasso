/**
 * Pure helpers shared across the spreadsheet readers (xlsx/xls). Kept here so
 * column-letter conversion, numeric coercion, and markdown-cell escaping stay
 * identical across the exceljs-backed (.xlsx) and SheetJS-backed (.xls) paths.
 */

/** Convert a 1-based column number to an Excel letter (1 -> "A", 27 -> "AA"). */
export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Best-effort coercion of a cell value to a number. */
export function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Strip currency, thousands separators, common suffixes.
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

/** Escape a cell for markdown table cells. */
export function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
