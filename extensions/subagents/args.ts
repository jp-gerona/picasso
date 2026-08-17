/**
 * args - child-process argument construction for the subagents extension.
 *
 * Pure and dependency-free so it can be unit-tested without pi or typebox.
 * buildChildArgs produces the exact `pi -p` invocation a dispatch runs, with
 * one difference from the fixed-config path: an explicit model override (the
 * `model` argument) wins over the agent's configured default model.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const BASH_GUARD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "bash-guard",
  "index.ts",
);

export interface AgentConfig {
  name: string;
  description: string;
  /** "provider/model-id" pattern passed to pi --model. */
  model: string;
  /** Tool allowlist passed to pi --tools. */
  tools: string[];
  systemPrompt: string;
}

export function buildChildArgs(agent: AgentConfig, task: string, model?: string): string[] {
  return [
    "-p",
    "--mode", "text",
    "--no-session",
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--no-extensions",
    "-e", BASH_GUARD,
    "--model", model ?? agent.model,
    "--tools", agent.tools.join(","),
    "--system-prompt", agent.systemPrompt,
    task,
  ];
}
