/**
 * args - child-process argument construction for the subagents extension.
 *
 * Pure and dependency-free so it can be unit-tested without pi or typebox.
 * Child processes receive only the trusted bash guard and, for the explicit
 * web_fetch allowlist entry, the installed trusted web-fetch extension.
 * An explicit model override wins over the agent's configured default model.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASH_GUARD = path.join(EXTENSIONS_DIR, "bash-guard", "index.ts");
const WEB_FETCH = path.join(EXTENSIONS_DIR, "web-fetch", "index.ts");

export interface AgentConfig {
  name: string;
  description: string;
  /** "provider/model-id" pattern passed to pi --model. */
  model: string;
  /** Tool allowlist passed to pi --tools. */
  tools: string[];
  systemPrompt: string;
}

export function childTimeoutMs(timeoutSeconds: number = 10 * 60): number {
  return timeoutSeconds * 1000;
}

export function buildChildArgs(agent: AgentConfig, task: string, model?: string): string[] {
  const extensions = agent.tools.includes("web_fetch")
    ? [BASH_GUARD, WEB_FETCH]
    : [BASH_GUARD];

  return [
    "-p",
    "--mode", "text",
    "--no-session",
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--no-extensions",
    ...extensions.flatMap((extension) => ["-e", extension]),
    "--model", model ?? agent.model,
    "--tools", agent.tools.join(","),
    "--system-prompt", agent.systemPrompt,
    task,
  ];
}
