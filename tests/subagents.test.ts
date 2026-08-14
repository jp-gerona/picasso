// Run: node --experimental-strip-types tests/subagents.test.ts
import assert from "node:assert";
import { buildChildArgs } from "../extensions/subagents/args.ts";

const agent = {
  name: "verify",
  description: "Runs tests/lint via bash and reports pass/fail with evidence",
  model: "opencode-go/deepseek-v4-flash",
  tools: ["bash"],
  systemPrompt: "You are a verification agent with only the bash tool.",
};

// Default: no override uses the agent's configured model.
{
  const args = buildChildArgs(agent, "run the tests");
  assert.ok(args.includes("--model"), "includes --model flag");
  assert.ok(args.includes("opencode-go/deepseek-v4-flash"), "uses agent model by default");
  assert.ok(!args.includes("opencode-go/qwen3.8-max"), "override absent does not leak in");
  assert.strictEqual(args[args.length - 1], "run the tests", "task is the last argument");
}

// Override: explicit model wins over the agent's configured model.
{
  const args = buildChildArgs(agent, "run the tests", "opencode-go/qwen3.8-max");
  assert.ok(args.includes("opencode-go/qwen3.8-max"), "uses override model");
  assert.ok(!args.includes("opencode-go/deepseek-v4-flash"), "agent model not used when override present");
}

// Tool list is comma-joined for --tools.
{
  const args = buildChildArgs({ ...agent, tools: ["read", "write", "bash"] }, "x");
  const ti = args.indexOf("--tools");
  assert.notStrictEqual(ti, -1, "has --tools flag");
  assert.strictEqual(args[ti + 1], "read,write,bash", "tools comma-joined");
}

// The child is sandboxed: no session/context/skills/prompts, only bash-guard.
{
  const args = buildChildArgs(agent, "x");
  for (const f of ["--no-session", "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-extensions"]) {
    assert.ok(args.includes(f), `includes ${f}`);
  }
  const ei = args.indexOf("-e");
  assert.notStrictEqual(ei, -1, "has -e");
  assert.ok(args[ei + 1].endsWith("bash-guard/index.ts"), "loads bash-guard only");
}

console.log("subagents: all assertions passed");
