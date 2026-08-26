/**
 * Legacy .xls (BIFF/OLE2) reader, SheetJS-backed. Mirrors readXlsx output so
 * downstream consumers see the same markdown shape regardless of source
 * format. analyzeXls delegates to the exceljs-backed analyzeXlsx via a temp
 * .xlsx, reusing all profiling/group-by/filter/report logic.
 */

import * as XLSX from "xlsx";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { safePath } from "../../../lib/safe-path.ts";
import { colLetter, toNum, esc } from "./shared.ts";
import { analyzeXlsxCore, readXlsx } from "./xlsx.ts";

/** Decode a sheet's !ref into a {minR,minC,maxR,maxC} range, empty-safe. */
function refRange(ref: string | undefined): { minR: number; minC: number; maxR: number; maxC: number } | null {
  if (!ref) return null;
  try {
    const r = XLSX.utils.decode_range(ref);
    return { minR: r.s.r, minC: r.s.c, maxR: r.e.r, maxC: r.e.c };
  } catch {
    return null;
  }
}

/** Format a SheetJS cell value for markdown output. Formatted text preferred. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/**
 * Detect leading header rows from a row-array (1-based row indices within the
 * sheet's ref). Mirrors the xlsx heuristic: if row2 is structurally more
 * specific than row1 and row3 has data, treat both as headers.
 */
function detectHeaderRows(rows: unknown[][], minR: number): number {
  if (rows.length < 2) return minR > 0 ? 0 : 1;
  const nonEmpty = (r: unknown[]) => r.filter((c) => c != null && c !== "").length;
  const distinct = (r: unknown[]) => new Set(r.map((c) => String(c ?? ""))).size;
  const r1 = rows[0] ?? [];
  const r2 = rows[1] ?? [];
  const r3 = rows[2] ?? [];
  if (nonEmpty(r2) >= nonEmpty(r1) && distinct(r2) > distinct(r1) && nonEmpty(r3) > 0) {
    return 2;
  }
  return 1;
}

/** Read a .xls workbook from disk via a buffer (avoids SheetJS path guards). */
function loadWorkbook(abs: string): XLSX.WorkBook {
  const buf = readFileSync(abs);
  return XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: false });
}

export async function readXls(
  cwd: string,
  params: {
    path: string;
    sheet?: string | number;
    headerRows?: number | "auto";
    maxRows?: number | "all";
    formulas?: boolean;
  },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  const wb = loadWorkbook(abs);

  const targetNames: string[] =
    params.sheet !== undefined
      ? [resolveSheetName(wb, params.sheet)]
      : wb.SheetNames;

  const maxRows = params.maxRows === "all" ? Infinity : params.maxRows ?? 200;
  const wantFormulas = params.formulas ?? false;
  const parts: string[] = [];

  for (const name of targetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const range = refRange(ws["!ref"]);
    if (!range) {
      parts.push(`## Sheet: ${name}`, "_(empty)_", "");
      continue;
    }
    const colCount = range.maxC - range.minC + 1;
    // All rows as arrays, using formatted (w) values.
    const allRows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      blankrows: true,
      range: range.minR,
    });
    // SheetJS may trim trailing empties; rowCount from ref is authoritative.
    const rowCount = range.maxR - range.minR + 1;

    const headerRows =
      params.headerRows === "auto" || params.headerRows === undefined
        ? detectHeaderRows(allRows, range.minR)
        : params.headerRows;
    const dataStart = headerRows;
    const totalDataRows = Math.max(0, allRows.length - headerRows);

    parts.push(`## Sheet: ${name}`);
    parts.push(`_${rowCount} rows x ${colCount} cols | ${totalDataRows} data rows | headerRows=${headerRows}_`);
    parts.push("");

    if (totalDataRows === 0) {
      parts.push("(no data rows)");
      parts.push("");
      continue;
    }

    const headers = buildHeaders(allRows, headerRows, colCount);

    let rowsToShow: number[];
    let truncated = false;
    if (totalDataRows <= maxRows) {
      rowsToShow = Array.from({ length: totalDataRows }, (_, i) => dataStart + i);
    } else {
      truncated = true;
      const half = Math.floor(maxRows / 2);
      const first = Array.from({ length: half }, (_, i) => dataStart + i);
      const last = Array.from({ length: maxRows - half }, (_, i) => dataStart + totalDataRows - (maxRows - half) + i);
      rowsToShow = [...first, ...last];
    }

    parts.push(`| ${headers.map(esc).join(" | ")} |`);
    parts.push(`| ${headers.map(() => "---").join(" | ")} |`);

    for (let i = 0; i < rowsToShow.length; i++) {
      const r = rowsToShow[i];
      if (truncated && i === Math.floor(maxRows / 2)) {
        parts.push(`| ... (_${totalDataRows - maxRows} rows omitted_) |`);
      }
      const row = allRows[r] ?? [];
      const cells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const addr = XLSX.utils.encode_cell({ r: range.minR + r, c: range.minC + c });
        const cell = ws[addr];
        const val = cell ? cell.w ?? cell.v : row[c];
        if (wantFormulas && cell && typeof cell.f === "string" && cell.f.length > 0) {
          cells.push(esc(`${fmt(val)} [=${cell.f}]`));
        } else {
          cells.push(esc(fmt(val)));
        }
      }
      parts.push(`| ${cells.join(" | ")} |`);
    }
    parts.push("");
    if (truncated) {
      parts.push(`_Showing ${maxRows} of ${totalDataRows} data rows. Pass maxRows: "all" or a higher number to see more._`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

function resolveSheetName(wb: XLSX.WorkBook, sheet: string | number): string {
  if (typeof sheet === "number") {
    const name = wb.SheetNames[sheet - 1];
    if (!name) throw new Error(`Sheet index ${sheet} out of range. Sheets: ${wb.SheetNames.join(", ")}`);
    return name;
  }
  if (!wb.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available: ${wb.SheetNames.join(", ")}`);
  }
  return sheet;
}

function buildHeaders(rows: unknown[][], headerRows: number, colCount: number): string[] {
  const tiers: unknown[][] = [];
  for (let r = 0; r < headerRows; r++) {
    tiers.push(rows[r] ?? []);
  }
  const headers: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const parts: string[] = [];
    let last = "";
    for (const tier of tiers) {
      const v = String(tier[c] ?? "").trim();
      if (v && v !== last) {
        parts.push(v);
        last = v;
      }
    }
    headers.push(parts.join(" - ") || colLetter(c + 1));
  }
  return headers;
}

export async function analyzeXls(
  cwd: string,
  params: {
    path: string;
    sheet?: string | number;
    profile?: boolean;
    groupBy?: string | number;
    agg?: "count" | "sum" | "avg" | "distinct";
    aggColumn?: string | number;
    filter?: { column: string | number; op: "eq" | "ne" | "gt" | "lt" | "in"; value: unknown }[];
    topN?: number;
  },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  const wb = loadWorkbook(abs);
  // Convert ONLY the target sheet to a slim temp .xlsx. Converting the whole
  // legacy workbook (often many sheets) is wasteful and can overflow SheetJS's
  // synchronous writer on large files; a single-sheet copy avoids both and is
  // all analyzeXlsx needs.
  const sheetName = resolveSheetName(wb, params.sheet ?? 1);
  const slim = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(slim, wb.Sheets[sheetName], sheetName);
  const dir = mkdtempSync(join(tmpdir(), "office-docs-xls-"));
  const tempXlsx = join(dir, "converted.xlsx");
  const xlsxBuf = XLSX.write(slim, { bookType: "xlsx", type: "buffer", compression: true });
  writeFileSync(tempXlsx, xlsxBuf);
  try {
    return await analyzeXlsxCore(tempXlsx, abs, { ...params, sheet: sheetName });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- Tool schemas -----------------------------------------------------------

export const readXlsSchema = Type.Object({
  path: Type.String({ description: "Path to .xls file (relative to cwd or absolute)." }),
  sheet: Type.Optional(
    Type.Union([Type.String(), Type.Number()], {
      description: "Sheet name or 1-based index. Omit to read all sheets.",
    }),
  ),
  headerRows: Type.Optional(
    Type.Union([Type.Number(), Type.Literal("auto")], {
      description: "Number of header rows. 'auto' (default) detects two-tier headers.",
    }),
  ),
  maxRows: Type.Optional(
    Type.Union([Type.Number(), Type.Literal("all")], {
      description: "Max data rows to return. Default 200 (sampled first+last). Use 'all' for everything.",
    }),
  ),
  formulas: Type.Optional(
    Type.Boolean({ description: "Include formula text alongside cached values. Default false." }),
  ),
});

export const analyzeXlsSchema = Type.Object({
  path: Type.String({ description: "Path to .xls file." }),
  sheet: Type.Optional(
    Type.Union([Type.String(), Type.Number()], {
      description: "Sheet name or 1-based index. Default: first sheet.",
    }),
  ),
  profile: Type.Optional(
    Type.Boolean({ description: "Per-column profile (type, missing, distinct, top values, numeric stats). Default true." }),
  ),
  groupBy: Type.Optional(
    Type.Union([Type.String(), Type.Number()], {
      description: "Column to group by for aggregation.",
    }),
  ),
  agg: Type.Optional(
    Type.String({ description: "Aggregation: count (default) | sum | avg | distinct." }),
  ),
  aggColumn: Type.Optional(
    Type.Union([Type.String(), Type.Number()], {
      description: "Column to aggregate (required for sum/avg/distinct).",
    }),
  ),
  filter: Type.Optional(
    Type.Array(
      Type.Object({
        column: Type.Union([Type.String(), Type.Number()]),
        op: Type.Union([Type.Literal("eq"), Type.Literal("ne"), Type.Literal("gt"), Type.Literal("lt"), Type.Literal("in"), Type.Literal("match")]),
        value: Type.Any(),
      }),
    ),
  ),
  topN: Type.Optional(Type.Number({ description: "Top N values per categorical column. Default 10." })),
});
