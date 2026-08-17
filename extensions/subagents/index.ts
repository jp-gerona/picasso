/**
 * subagents - a Pi extension that spawns isolated child Pi processes.
 *
 * Each dispatch runs `pi -p` in a fresh process with its own model, tool list,
 * and system prompt. Nothing is inherited from the calling session - no
 * conversation, no session file, no context files - so every task description
 * must be fully self-contained.
 *
 * Agent configs are data: JSON files in ./agents/*.json next to this file.
 * Child processes load only the bash-guard extension (headless mode), never
 * this one, so subagents cannot recursively spawn subagents.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildChildArgs, type AgentConfig } from "./args.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(HERE, "agents");

const MAX_CONCURRENCY = 4;
const TASK_TIMEOUT_MS = 10 * 60 * 1000;

function loadAgentConfigs(): Map<string, AgentConfig> {
  const configs = new Map<string, AgentConfig>();
  if (!fs.existsSync(AGENTS_DIR)) return configs;
  for (const file of fs.readdirSync(AGENTS_DIR)) {
    if (!file.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, file), "utf8"));
    if (
      typeof raw.name !== "string" ||
      typeof raw.model !== "string" ||
      !Array.isArray(raw.tools) ||
      typeof raw.systemPrompt !== "string"
    ) {
      throw new Error(`subagents: invalid agent config ${file}`);
    }
    configs.set(raw.name, raw as AgentConfig);
  }
  return configs;
}

interface TaskResult {
  agent: string;
  task: string;
  ok: boolean;
  output: string;
}

async function runOne(
  pi: ExtensionAPI,
  agent: AgentConfig,
  task: string,
  cwd: string,
  signal: AbortSignal | undefined,
  model?: string,
): Promise<TaskResult> {
  const args = buildChildArgs(agent, task, model);
  try {
    const result = await pi.exec("pi", args, { cwd, signal, timeout: TASK_TIMEOUT_MS });
    const output = (result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "")).trim();
    return { agent: agent.name, task, ok: result.code === 0, output: output || "(no output)" };
  } catch (err) {
    return { agent: agent.name, task, ok: false, output: `spawn failed: ${String(err)}` };
  }
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  // Fixed lane pool: each lane pulls the next index via next++, so concurrency
  // never exceeds `limit` and a lane that finishes early picks up the next
  // item instead of idling. Results land at their original index.
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

export default function (pi: ExtensionAPI) {
  const agents = loadAgentConfigs();
  const agentList = [...agents.values()].map((a) => `${a.name}: ${a.description}`).join("; ");

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Dispatch tasks to isolated child Pi agents. Each child starts with zero context " +
      "from this session, so every task string must be fully self-contained (absolute " +
      "paths, complete instructions, success criteria). Single task: set agent+task. " +
      `Parallel: set tasks (max concurrency ${MAX_CONCURRENCY}). Agents: ${agentList || "(none configured)"}. ` +
      "Route by model (cheapest capable model for the task): opencode-go/deepseek-v4-flash " +
      "or opencode-go/gpt-5.6-luna for mechanical work, opencode-go/deepseek-v4-pro for " +
      "standard work, opencode-go/kimi-k2.7-code or opencode-go/kimi-k3 for complex/" +
      "multifile work, opencode-go/qwen3.8-max for the hardest work and final reviews. " +
      "Omitted model uses the agent's configured default.",
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name for single-task mode" })),
      task: Type.Optional(Type.String({ description: "Task for single-task mode" })),
      model: Type.Optional(Type.String({ description: "Optional model override (provider/model-id) for single-task mode" })),
      tasks: Type.Optional(
        Type.Array(
          Type.Object({
            agent: Type.String(),
            task: Type.String(),
            model: Type.Optional(Type.String({ description: "Optional model override (provider/model-id) for this task" })),
          }),
          { description: "Independent tasks for parallel mode" },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const jobs: Array<{ agent: string; task: string; model?: string }> =
        params.tasks && params.tasks.length > 0
          ? params.tasks
          : params.agent && params.task
            ? [{ agent: params.agent, task: params.task, model: params.model }]
            : [];
      if (jobs.length === 0) {
        return {
          content: [{ type: "text", text: "Provide either agent+task, or a non-empty tasks array." }],
          isError: true,
        };
      }
      for (const job of jobs) {
        if (!agents.has(job.agent)) {
          return {
            content: [
              {
                type: "text",
                text: `Unknown agent "${job.agent}". Available: ${[...agents.keys()].join(", ") || "(none)"}`,
              },
            ],
            isError: true,
          };
        }
      }

      let done = 0;
      const results = await runPool(jobs, MAX_CONCURRENCY, async (job) => {
        const r = await runOne(pi, agents.get(job.agent)!, job.task, ctx.cwd, signal, job.model);
        done++;
        onUpdate?.({ content: [{ type: "text", text: `${done}/${jobs.length} finished` }] });
        return r;
      });

      const text = results
        .map((r) => `### ${r.agent} [${r.ok ? "ok" : "FAILED"}]\nTask: ${r.task}\n\n${r.output}`)
        .join("\n\n---\n\n");
      return {
        content: [{ type: "text", text }],
        details: { results },
        isError: results.some((r) => !r.ok),
      };
    },
  });
}
