import ExcelJS from "exceljs";
import { basename } from "node:path";
import { Type } from "typebox";
import { resolveOutputRoot, appendArtifact, slugify, today } from "../../../lib/output-dir.ts";
import { safePath } from "../../../lib/safe-path.ts";
import { colLetter, toNum, esc } from "./shared.ts";

/** Extract a formula's result or formula string from an exceljs cell value. */
function formulaText(v: unknown): { result: unknown; formula: string | null } {
  if (typeof v !== "object" || v === null) return { result: v, formula: null };
  const obj = v as Record<string, unknown>;
  if (typeof obj.formula === "string") return { result: obj.result, formula: obj.formula };
  if (typeof obj.sharedFormula === "string") return { result: obj.result, formula: null };
  // exceljs rich text: { richText: [{ value: "..." }, ...] }.
  if (Array.isArray(obj.richText)) {
    const text = obj.richText
      .map((r) => (r && typeof r === "object" && "value" in r ? String((r as Record<string, unknown>).value) : String(r)))
      .join("");
    return { result: text, formula: null };
  }
  // Unrecognized object shape (hyperlinks, errors, etc.). Never return v as
  // result - that would make fmt recurse infinitely on this same object.
  return { result: undefined, formula: null };
}

/** Format a cell value for markdown output (renders formula results, not raw objects). */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const { result } = formulaText(v);
    return fmt(result);
  }
  return String(v);
}

/**
 * Detect how many leading rows constitute the header. Heuristic: a row is a
 * header row if the next row differs structurally (more non-empty cells, or a
 * shift from repeated category labels to concrete data). We cap at 2 since
 * two-tier headers are the common case; the caller can override.
 */
function detectHeaderRows(ws: ExcelJS.Worksheet): number {
  const r1 = ws.getRow(1).values as unknown[];
  const r2 = ws.getRow(2).values as unknown[];
  const r3 = ws.getRow(3).values as unknown[];
  const nonEmpty = (r: unknown[]) => r.filter((c) => c != null && c !== "").length;
  // If row2 is clearly more specific (more distinct values) than row1, treat
  // both as headers.
  const distinct = (r: unknown[]) => new Set(r.map((c) => String(c ?? ""))).size;
  if (
    nonEmpty(r2) >= nonEmpty(r1) &&
    distinct(r2) > distinct(r1) &&
    nonEmpty(r3) > 0
  ) {
    return 2;
  }
  return 1;
}

/**
 * Build header labels for the table. When headerRows > 1, merge tiers with
 * " - " (skipping empty/repeated upper-tier labels).
 */
function buildHeaders(
  ws: ExcelJS.Worksheet,
  headerRows: number,
  colCount: number,
): string[] {
  const tiers: string[][] = [];
  for (let r = 1; r <= headerRows; r++) {
    tiers.push((ws.getRow(r).values as unknown[]).slice(1, colCount + 1));
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

export async function readXlsx(
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);

  const targetSheets: ExcelJS.Worksheet[] = [];
  if (params.sheet !== undefined) {
    const ws =
      typeof params.sheet === "number"
        ? wb.getWorksheet(params.sheet) ?? wb.worksheets[params.sheet - 1]
        : wb.getWorksheet(params.sheet);
    if (!ws) {
      throw new Error(
        `Sheet "${params.sheet}" not found. Available: ${wb.worksheets.map((s) => s.name).join(", ")}`,
      );
    }
    targetSheets.push(ws);
  } else {
    targetSheets.push(...wb.worksheets);
  }

  const maxRows = params.maxRows === "all" ? Infinity : params.maxRows ?? 200;
  const wantFormulas = params.formulas ?? false;
  const parts: string[] = [];

  for (const ws of targetSheets) {
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    const headerRows =
      params.headerRows === "auto" || params.headerRows === undefined
        ? detectHeaderRows(ws)
        : params.headerRows;

    const headers = buildHeaders(ws, headerRows, colCount);
    const dataStart = headerRows + 1;
    const totalDataRows = Math.max(0, rowCount - headerRows);

    parts.push(`## Sheet: ${ws.name}`);
    parts.push(`_${rowCount} rows x ${colCount} cols | ${totalDataRows} data rows | headerRows=${headerRows}_`);
    parts.push("");

    if (totalDataRows === 0) {
      parts.push("(no data rows)");
      parts.push("");
      continue;
    }

    // Sampling: if data exceeds maxRows, show first N and last N with a marker.
    let rowsToShow: number[];
    let truncated = false;
    if (totalDataRows <= maxRows) {
      rowsToShow = Array.from({ length: totalDataRows }, (_, i) => dataStart + i);
    } else {
      truncated = true;
      const half = Math.floor(maxRows / 2);
      const first: number[] = Array.from({ length: half }, (_, i) => dataStart + i);
      const last: number[] = Array.from(
        { length: maxRows - half },
        (_, i) => dataStart + totalDataRows - (maxRows - half) + i,
      );
      rowsToShow = [...first, ...last];
    }

    // Header row.
    parts.push(`| ${headers.map(esc).join(" | ")} |`);
    parts.push(`| ${headers.map(() => "---").join(" | ")} |`);

    for (let i = 0; i < rowsToShow.length; i++) {
      const r = rowsToShow[i];
      if (truncated && i === Math.floor(maxRows / 2)) {
        parts.push(`| ... (_${totalDataRows - maxRows} rows omitted_) |`);
      }
      const vals: unknown[] = (ws.getRow(r).values as unknown[]).slice(1, colCount + 1);
      const cells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const cell = ws.getCell(r, c + 1);
        const { result, formula } = formulaText(cell.value);
        if (wantFormulas && formula) {
          cells.push(esc(`${fmt(result)} [=${formula}]`));
        } else {
          cells.push(esc(fmt(result)));
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

interface ProfileResult {
  column: string;
  type: "numeric" | "categorical" | "datetime" | "empty" | "mixed";
  missing: number;
  distinct: number;
  topValues?: { value: string; count: number }[];
  numeric?: { min: number; max: number; mean: number; sum: number };
}

export async function analyzeXlsxCore(
  dataAbs: string,
  labelPath: string,
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dataAbs);

  let ws: ExcelJS.Worksheet;
  if (params.sheet !== undefined) {
    ws =
      typeof params.sheet === "number"
        ? wb.getWorksheet(params.sheet) ?? wb.worksheets[params.sheet - 1]
        : wb.getWorksheet(params.sheet);
    if (!ws) {
      throw new Error(
        `Sheet "${params.sheet}" not found. Available: ${wb.worksheets.map((s) => s.name).join(", ")}`,
      );
    }
  } else {
    ws = wb.worksheets[0];
  }

  const headerRows = detectHeaderRows(ws);
  const colCount = ws.columnCount;
  const headers = buildHeaders(ws, headerRows, colCount);
  const dataStart = headerRows + 1;
  const totalDataRows = Math.max(0, ws.rowCount - headerRows);
  const topN = params.topN ?? 10;

  /**
   * Consolidate this call's results into a single per-workbook report under
   * the shared output root, appending a section to an existing same-day file
   * rather than minting a new timestamped file per call. Returns a short digest
   * plus the saved path so tool results stay token-cheap.
   */
  const finish = (report: string): string => {
    const section = report;
    const header = [
      `# Analysis: ${basename(labelPath)}`,
      "",
      `Source workbook: ${labelPath}`,
      `Generated ${today()}. Profiles and group-bys for this workbook in one session append below.`,
      "",
      "---",
      "",
      "How to read this: every figure in every section below is computed in-process over ALL rows of the sheet,",
      "never sampled, so counts and sums are exact. Column profiles show each column's type, missing-value count,",
      "number of distinct values, most frequent values, and - for numeric columns - min/max/mean/sum.",
    ].join("\n");
    let savedPath: string | null = null;
    let created = false;
    try {
      const out = appendArtifact(
        resolveOutputRoot(),
        "office",
        `${today()}-${slugify(basename(labelPath))}-analysis`,
        section,
        header,
      );
      savedPath = out.path;
      created = out.created;
    } catch {
      // Persisting is best-effort; the analysis itself already succeeded.
    }
    const what = params.groupBy !== undefined ? "group-by aggregation" : "column profiles";
    const lines = [
      `Analyzed ${basename(labelPath)} - ${ws.name}: ${totalDataRows} data rows (${filtered.length} after filter); ${what} computed over all rows.`,
    ];
    if (savedPath) {
      lines.push(created
        ? `Report saved to ${savedPath}.`
        : `Report appended to ${savedPath} (consolidated with earlier analyses of this workbook).`);
    } else {
      lines.push("Report could not be saved to disk; full tables follow.", "", report);
    }
    return lines.join("\n");
  };

  // Resolve a column reference (name or 1-based index) to a 0-based index.
  const resolveCol = (ref: string | number): number => {
    if (typeof ref === "number") return ref - 1;
    const idx = headers.findIndex((h) => h === ref || h.endsWith(` - ${ref}`) || h.startsWith(`${ref} -`));
    if (idx === -1) throw new Error(`Column "${ref}" not found. Columns: ${headers.join(", ")}`);
    return idx;
  };

  // Read all data rows into arrays for efficient multi-pass analysis.
  const rows: unknown[][] = [];
  for (let r = dataStart; r <= ws.rowCount; r++) {
    const vals = (ws.getRow(r).values as unknown[]).slice(1, colCount + 1);
    // Skip fully-empty rows.
    if (vals.every((v) => v == null || v === "")) continue;
    rows.push(vals);
  }

  // Apply filters.
  let filtered = rows;
  if (params.filter && params.filter.length > 0) {
    filtered = rows.filter((row) =>
      params.filter!.every((f) => {
        const idx = resolveCol(f.column);
        const v = row[idx];
        switch (f.op) {
          case "eq":
            return fmt(v) === fmt(f.value);
          case "ne":
            return fmt(v) !== fmt(f.value);
          case "gt":
            return toNum(v) != null && toNum(v)! > (toNum(f.value) ?? NaN);
          case "lt":
            return toNum(v) != null && toNum(v)! < (toNum(f.value) ?? NaN);
          case "in":
            return Array.isArray(f.value) && f.value.some((x) => fmt(x) === fmt(v));
          case "match": {
            if (typeof f.value !== "string") return false;
            try {
              return new RegExp(f.value).test(fmt(v));
            } catch {
              return false;
            }
          }
          default:
            return true;
        }
      }),
    );
  }

  const parts: string[] = [];
  parts.push(`## Analysis: ${ws.name}`);
  parts.push(`_${totalDataRows} data rows | ${filtered.length} after filter_`);
  parts.push("");

  // Group-by aggregation.
  if (params.groupBy !== undefined) {
    const gIdx = resolveCol(params.groupBy);
    const agg = params.agg ?? "count";
    const aIdx = params.aggColumn !== undefined ? resolveCol(params.aggColumn) : -1;
    const groups = new Map<string, { count: number; sum: number; values: number[]; distinct: Set<string> }>();
    for (const row of filtered) {
      const key = fmt(row[gIdx]) || "(empty)";
      if (!groups.has(key)) groups.set(key, { count: 0, sum: 0, values: [], distinct: new Set() });
      const g = groups.get(key)!;
      g.count++;
      if (aIdx >= 0) {
        const n = toNum(row[aIdx]);
        if (n != null) {
          g.sum += n;
          g.values.push(n);
        }
        g.distinct.add(fmt(row[aIdx]));
      }
    }
    const aggLabel =
      agg === "count"
        ? "Count"
        : agg === "sum"
          ? `Sum of ${headers[aIdx] ?? "?"}`
          : agg === "avg"
            ? `Avg of ${headers[aIdx] ?? "?"}`
            : `Distinct ${headers[aIdx] ?? "?"}`;
    parts.push(`| ${headers[gIdx]} | ${aggLabel} |`);
    parts.push(`| --- | --- |`);
    const sorted = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [key, g] of sorted) {
      let val: string;
      if (agg === "count") val = String(g.count);
      else if (agg === "sum") val = String(g.sum);
      else if (agg === "avg") val = g.values.length ? (g.sum / g.values.length).toFixed(2) : "0";
      else val = String(g.distinct.size);
      parts.push(`| ${esc(key)} | ${val} |`);
    }
    parts.push("");
    return finish(parts.join("\n"));
  }

  // Column profiles.
  if (params.profile !== false) {
    parts.push(`| Column | Type | Missing | Distinct | Top values | Numeric stats |`);
    parts.push(`| --- | --- | --- | --- | --- | --- |`);
    for (let c = 0; c < colCount; c++) {
      const values = filtered.map((r) => r[c]);
      const present = values.filter((v) => v != null && v !== "");
      const missing = values.length - present.length;
      const asNums = present.map(toNum).filter((n): n is number => n != null);
      const asStrings = present.map(fmt);
      const distinctSet = new Set(asStrings);

      let type: ProfileResult["type"] = "empty";
      if (present.length > 0) {
        if (asNums.length === present.length) type = "numeric";
        else if (present.every((v) => v instanceof Date)) type = "datetime";
        else if (asNums.length > 0) type = "mixed";
        else type = "categorical";
      }

      const counts = new Map<string, number>();
      for (const s of asStrings) counts.set(s, (counts.get(s) ?? 0) + 1);
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([value, count]) => `${esc(value)} (${count})`)
        .join(", ");

      let numericStats = "";
      if (type === "numeric" && asNums.length > 0) {
        const sum = asNums.reduce((a, b) => a + b, 0);
        numericStats = `min=${Math.min(...asNums)}, max=${Math.max(...asNums)}, mean=${(sum / asNums.length).toFixed(2)}, sum=${sum}`;
      }

      parts.push(
        `| ${esc(headers[c])} | ${type} | ${missing} | ${distinctSet.size} | ${top} | ${numericStats} |`,
      );
    }
    parts.push("");
  }

  return finish(parts.join("\n"));
}

/** Resolve the user-supplied path via safePath, then delegate to the core. */
export async function analyzeXlsx(
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
  return analyzeXlsxCore(abs, abs, params);
}

export async function writeXlsx(
  cwd: string,
  params: {
    path: string;
    sheets: { name: string; rows: unknown[][] }[];
  },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  const wb = new ExcelJS.Workbook();
  for (const s of params.sheets) {
    const ws = wb.addWorksheet(s.name);
    for (let r = 0; r < s.rows.length; r++) {
      for (let c = 0; c < s.rows[r].length; c++) {
        const v = s.rows[r][c];
        // Preserve formula strings.
        if (typeof v === "string" && v.startsWith("=")) {
          ws.getCell(r + 1, c + 1).value = { formula: v.slice(1) };
        } else {
          ws.getCell(r + 1, c + 1).value = v as ExcelJS.CellValue;
        }
      }
    }
  }
  await wb.xlsx.writeFile(abs);
  return `Wrote ${params.sheets.length} sheet(s) to ${params.path}`;
}

export async function updateXlsx(
  cwd: string,
  params: {
    path: string;
    sheet: string | number;
    updates:
      | { cell: string; value: unknown }
      | { cell: string; value: unknown }[];
  },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);
  const ws =
    typeof params.sheet === "number"
      ? wb.getWorksheet(params.sheet) ?? wb.worksheets[params.sheet - 1]
      : wb.getWorksheet(params.sheet) ?? wb.addWorksheet(params.sheet);

  const list = Array.isArray(params.updates) ? params.updates : [params.updates];
  for (const u of list) {
    if (typeof u.value === "string" && u.value.startsWith("=")) {
      ws.getCell(u.cell).value = { formula: u.value.slice(1) };
    } else {
      ws.getCell(u.cell).value = u.value as ExcelJS.CellValue;
    }
  }
  await wb.xlsx.writeFile(abs);
  return `Updated ${list.length} cell(s) in ${ws.name} of ${params.path}`;
}

// --- Tool schemas -----------------------------------------------------------

export const readXlsxSchema = Type.Object({
  path: Type.String({ description: "Path to .xlsx file (relative to cwd or absolute)." }),
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

export const analyzeXlsxSchema = Type.Object({
  path: Type.String({ description: "Path to .xlsx file." }),
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

export const writeXlsxSchema = Type.Object({
  path: Type.String({ description: "Path to write." }),
  sheets: Type.Array(
    Type.Object({
      name: Type.String({ description: "Sheet name." }),
      rows: Type.Array(Type.Array(Type.Any()), { description: "2D array of cell values. Strings starting with '=' are formulas." }),
    }),
  ),
});

export const updateXlsxSchema = Type.Object({
  path: Type.String({ description: "Path to existing .xlsx file." }),
  sheet: Type.Union([Type.String(), Type.Number()], { description: "Sheet name or 1-based index." }),
  updates: Type.Union(
    [
      Type.Object({ cell: Type.String({ description: 'Cell reference e.g. "A1".' }), value: Type.Any() }),
      Type.Array(Type.Object({ cell: Type.String(), value: Type.Any() })),
    ],
    { description: "One or many {cell, value} updates." },
  ),
});
