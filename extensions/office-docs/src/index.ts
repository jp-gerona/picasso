import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
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
  readXls,
  analyzeXls,
  readXlsSchema,
  analyzeXlsSchema,
} from "./xls.ts";
import {
  readDocx,
  writeDocx,
  updateDocx,
  readDocxSchema,
  writeDocxSchema,
  updateDocxSchema,
} from "./docx.ts";
import { readDoc, readDocSchema } from "./doc.ts";
import { gateDecision, gateKey, isWriteTool, WRITE_TOOLS } from "./gate.ts";

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
  // --- Spreadsheet tools --------------------------------------------------

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
      "Create or overwrite an .xlsx workbook from sheets (2D arrays of values). Strings starting with '=' are written as formulas. Overwrites by default. Gated: the agent must propose the write and get explicit user confirmation, then call confirm_write, before this runs. Requests to author legacy .xls are routed here as .xlsx instead.",
    parameters: writeXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => writeXlsx(ctx.cwd, params as Parameters<typeof writeXlsx>[1]));
    },
  });

  pi.registerTool({
    name: "update_xlsx",
    label: "Update Excel cells",
    description:
      "Update one or more cells in an existing .xlsx sheet by cell reference (e.g. 'A1'). Strings starting with '=' are formulas. Sheet is created if missing. Gated: requires a confirmed proposal via confirm_write first.",
    parameters: updateXlsxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => updateXlsx(ctx.cwd, params as Parameters<typeof updateXlsx>[1]));
    },
  });

  // --- Legacy spreadsheet (read-only) ------------------------------------

  pi.registerTool({
    name: "read_xls",
    label: "Read legacy Excel",
    description:
      "Read a legacy .xls (Excel 97-2003 / BIFF) spreadsheet and return its contents as markdown tables. Same output shape as read_xlsx. Use for inspecting .xls files. Write/update of .xls is not supported - author .xlsx instead.",
    parameters: readXlsSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => readXls(ctx.cwd, params as Parameters<typeof readXls>[1]));
    },
  });

  pi.registerTool({
    name: "analyze_xls",
    label: "Analyze legacy Excel",
    description:
      "Run deterministic in-process aggregation over a legacy .xls sheet (profiles columns and/or group-by). Converts the .xls to a temp .xlsx internally and reuses the full analyze_xlsx pipeline, so all profiling/group-by/filter logic and the consolidated report at ~/Documents/pi/office/ are identical. Returns a digest plus the report path.",
    parameters: analyzeXlsSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => analyzeXls(ctx.cwd, params as Parameters<typeof analyzeXls>[1]));
    },
  });

  // --- Word tools --------------------------------------------------------

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
      "Create, overwrite, or append to a .docx file from markdown content. Supports headings, bold/italic/code, bullet/numbered lists, and tables. Gated: requires a confirmed proposal via confirm_write first. Requests to author legacy .doc are routed here as .docx instead.",
    parameters: writeDocxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => writeDocx(ctx.cwd, params as Parameters<typeof writeDocx>[1]));
    },
  });

  pi.registerTool({
    name: "update_docx",
    label: "Update Word",
    description:
      "Apply find/replace edits to a .docx file in place. Pass an array of {find, replace}. Returns count of edits that matched. Gated: requires a confirmed proposal via confirm_write first.",
    parameters: updateDocxSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => updateDocx(ctx.cwd, params as Parameters<typeof updateDocx>[1]));
    },
  });

  // --- Legacy Word (read-only) -------------------------------------------

  pi.registerTool({
    name: "read_doc",
    label: "Read legacy Word",
    description:
      "Read a legacy .doc (Word 97-2003 binary) file and return its content as markdown. Uses the macOS built-in 'textutil' (no install). macOS-only. Write/update of .doc is not supported - author .docx instead.",
    parameters: readDocSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return run(() => readDoc(ctx.cwd, params as Parameters<typeof readDoc>[1]));
    },
  });

  // --- Propose-and-confirm gate ------------------------------------------

  // Session-scoped armed set: one-shot passes keyed by `${tool}:${absPath}`.
  const armed = new Set<string>();

  pi.on("tool_call", (event, ctx) => {
    if (!isWriteTool(event.toolName)) return;
    const input = event.input as { path?: string };
    const key = gateKey(ctx.cwd, event.toolName, input?.path);
    const verdict = gateDecision(event.toolName, key, armed);
    if (verdict.block) {
      return { block: true, reason: verdict.reason };
    }
  });

  pi.registerTool({
    name: "confirm_write",
    label: "Confirm a gated write",
    description:
      "Arm a one-shot pass for a gated office write/update tool (write_xlsx, update_xlsx, write_docx, update_docx). Call this AFTER proposing the approach in chat and getting explicit user confirmation, then retry the gated tool with the same path. Requests to author .xls/.doc should target .xlsx/.docx instead.",
    parameters: Type.Object({
      tool: Type.Union(
        WRITE_TOOLS.map((t) => Type.Literal(t)),
        { description: `Which gated tool to arm: ${WRITE_TOOLS.join(" | ")}.` },
      ),
      path: Type.String({ description: "Target path, identical to the one the gated tool will be called with." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const p = params as { tool: string; path: string };
      const key = gateKey(ctx.cwd, p.tool as (typeof WRITE_TOOLS)[number], p.path);
      if (!key) {
        return { content: [{ type: "text", text: "Error: path could not be resolved for arming." }], details: {}, isError: true };
      }
      armed.add(key);
      return {
        content: [{ type: "text", text: `Armed ${p.tool} on ${p.path}. Retry the call now (one-shot).` }],
        details: {},
      };
    },
  });
}
