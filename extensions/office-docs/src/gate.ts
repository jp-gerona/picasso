/**
 * Propose-and-confirm gate for office document writes. Enforces a
 * brainstorm-style checkpoint at the tool boundary: the agent must propose a
 * create/update approach (target path, format, content/cells, rationale) and
 * obtain explicit user confirmation before any write_xlsx/update_xlsx/
 * write_docx/update_docx call proceeds.
 *
 * Mechanism: a tool_call interceptor (registered in index.ts) blocks the
 * first write for a given target; the small confirm_write tool arms a
 * one-shot pass for that exact (tool, path) pair.
 *
 * Legacy (.xls/.doc) authoring is intentionally ungated and unsupported - no
 * such write tools are registered. Requests to create/update .xls/.doc are
 * routed to .xlsx/.docx instead; see the tool descriptions and README.
 */

import { safePath } from "../../../lib/safe-path.ts";

export const WRITE_TOOLS = ["write_xlsx", "update_xlsx", "write_docx", "update_docx"] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

export function isWriteTool(name: string): name is WriteTool {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}

/** Verdict returned by the interceptor. `block` with a reason instructs the
 *  agent to propose and confirm first. */
export interface GateVerdict {
  block: boolean;
  reason?: string;
}

/** Build the instruction shown when a write is blocked. Kept here so the
 *  message stays consistent and is exercised by selftest. */
export function blockReason(tool: WriteTool): string {
  return [
    `Gated: ${tool} requires a confirmed proposal before it runs.`,
    "",
    "Before retrying, do ALL of the following in chat:",
    "1. Propose the approach: target path, output format, sheet/cell layout or document content, and why.",
    "2. If the requested target ends in .xls or .doc, route to the modern .xlsx or .docx format instead - legacy formats are read-only.",
    "3. Get an explicit user confirmation (yes) before proceeding.",
    "4. Call the confirm_write tool with the SAME path and tool name, then retry the write.",
  ].join("\n");
}

/** Decide whether to block a tool call. `armed` is mutated (one-shot) on allow. */
export function gateDecision(
  toolName: string,
  key: string | undefined,
  armed: Set<string>,
): GateVerdict {
  if (!isWriteTool(toolName)) return { block: false };
  if (!key) return { block: false };
  if (armed.has(key)) {
    armed.delete(key);
    return { block: false };
  }
  return { block: true, reason: blockReason(toolName) };
}

/** Armed-key shape: `${toolName}:${absPath}`. */
export function gateKey(cwd: string, tool: WriteTool, rawPath: unknown): string | undefined {
  if (typeof rawPath !== "string" || rawPath.length === 0) return undefined;
  try {
    return `${tool}:${safePath(cwd, rawPath)}`;
  } catch {
    // Path fails the trusted-root check; let the tool itself report the error.
    return `${tool}:${rawPath}`;
  }
}
