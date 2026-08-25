import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  readXlsx,
  analyzeXlsx,
  writeXlsx,
  updateXlsx,
  readXlsxSchema,
  analyzeXlsxSchema,
  writeXlsxSchema,
  updateXlsxSchema,
} from "./xlsx.ts";
import {
  readDocx,
  writeDocx,
  updateDocx,
  readDocxSchema,
  writeDocxSchema,
  updateDocxSchema,
} from "./docx.ts";

/** Run an async tool body, returning a tool result with isError on throw. */
async function run(
  fn: () => Promise<string>,
): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown>; isError?: boolean }> {
  try {
    const text = await fn();
    return { content: [{ type: "text", text }], details: {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${msg}` }], details: {}, isError: true };
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "read_xlsx",
    label: "Read Excel",
    description:
      "Read an .xlsx spreadsheet and return its contents as markdown tables. Auto-detects two-tier headers. Samples large sheets (first+last rows) by default. Use for seeing structure/format of a sheet.",
    parameters: readXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => readXlsx(ctx.cwd, params as Parameters<typeof readXlsx>[1]));
    },
  });

  pi.registerTool({
    name: "analyze_xlsx",
    label: "Analyze Excel",
    description:
      "Run deterministic in-process aggregation over an .xlsx sheet. Profiles columns (type, missing, distinct, top values, numeric stats) and/or groups by a column with count/sum/avg/distinct. Computed over ALL rows - not token-burning. Saves a full markdown report to the shared output root (~/Documents/pi/office/) and returns a digest plus the report path.",
    parameters: analyzeXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => analyzeXlsx(ctx.cwd, params as Parameters<typeof analyzeXlsx>[1]));
    },
  });

  pi.registerTool({
    name: "write_xlsx",
    label: "Write Excel",
    description:
      "Create or overwrite an .xlsx workbook from sheets (2D arrays of values). Strings starting with '=' are written as formulas. Overwrites by default.",
    parameters: writeXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => writeXlsx(ctx.cwd, params as Parameters<typeof writeXlsx>[1]));
    },
  });

  pi.registerTool({
    name: "update_xlsx",
    label: "Update Excel cells",
    description:
      "Update one or more cells in an existing .xlsx sheet by cell reference (e.g. 'A1'). Strings starting with '=' are formulas. Sheet is created if missing.",
    parameters: updateXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => updateXlsx(ctx.cwd, params as Parameters<typeof updateXlsx>[1]));
    },
  });

  pi.registerTool({
    name: "read_docx",
    label: "Read Word",
    description: "Read a .docx file and return its content as markdown (headings, lists, tables preserved).",
    parameters: readDocxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => readDocx(ctx.cwd, params as Parameters<typeof readDocx>[1]));
    },
  });

  pi.registerTool({
    name: "write_docx",
    label: "Write Word",
    description:
      "Create, overwrite, or append to a .docx file from markdown content. Supports headings, bold/italic/code, bullet/numbered lists, and tables.",
    parameters: writeDocxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => writeDocx(ctx.cwd, params as Parameters<typeof writeDocx>[1]));
    },
  });

  pi.registerTool({
    name: "update_docx",
    label: "Update Word",
    description:
      "Apply find/replace edits to a .docx file in place. Pass an array of {find, replace}. Returns count of edits that matched.",
    parameters: updateDocxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => updateDocx(ctx.cwd, params as Parameters<typeof updateDocx>[1]));
    },
  });
}
