// subagents.test.ts - child argument and profile contracts for isolated delegation.
// Run: node --experimental-strip-types tests/subagents.test.ts
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChildArgs, childTimeoutMs, type AgentConfig } from "../extensions/subagents/args.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = path.join(HERE, "..", "extensions");
const AGENTS_DIR = path.join(EXTENSIONS_DIR, "subagents", "agents");
const BASH_GUARD = path.join(EXTENSIONS_DIR, "bash-guard", "index.ts");
const WEB_FETCH = path.join(EXTENSIONS_DIR, "web-fetch", "index.ts");

function loadAgent(name: string): AgentConfig {
  return JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, `${name}.json`), "utf8")) as AgentConfig;
}

function optionValue(args: string[], option: string): string {
  const index = args.indexOf(option);
  assert.notStrictEqual(index, -1, `includes ${option}`);
  return args[index + 1];
}

function extensionPaths(args: string[]): string[] {
  return args.flatMap((arg, index) => arg === "-e" ? [args[index + 1]] : []);
}

const implement = loadAgent("implement");
const review = loadAgent("review");
const verify = loadAgent("verify");
const investigate = loadAgent("investigate");
const specialist = loadAgent("specialist");

// Read-only profiles have fixed defaults and no mutating or shell tools.
assert.deepStrictEqual(
  { model: investigate.model, tools: investigate.tools },
  { model: "openai-codex/gpt-5.6-luna", tools: ["read", "grep", "find", "ls", "web_fetch"] },
  "investigator contract",
);
assert.deepStrictEqual(
  { model: specialist.model, tools: specialist.tools },
  { model: "openai-codex/gpt-5.6-terra", tools: ["read", "grep", "find", "ls"] },
  "specialist contract",
);
assert.deepStrictEqual(
  { model: review.model, tools: review.tools },
  { model: "openai-codex/gpt-5.6-terra", tools: ["read", "grep"] },
  "review contract",
);

// Normal agents load exactly the bash guard; only investigator adds web-fetch.
for (const profile of [implement, review, verify, specialist]) {
  const args = buildChildArgs(profile, "bounded task");
  assert.deepStrictEqual(
    extensionPaths(args),
    [BASH_GUARD],
    `${profile.name} loads only bash-guard`,
  );
}
{
  const args = buildChildArgs(investigate, "bounded task");
  assert.deepStrictEqual(
    extensionPaths(args),
    [BASH_GUARD, WEB_FETCH],
    "investigator loads the trusted web-fetch extension",
  );
  assert.strictEqual(optionValue(args, "--tools"), "read,grep,find,ls,web_fetch", "investigator allowlist is exact");
}

// Every child remains isolated, preserves its tool allowlist, and receives the task last.
for (const profile of [implement, review, verify, investigate, specialist]) {
  const task = `${profile.name} task`;
  const args = buildChildArgs(profile, task);
  for (const flag of ["--no-session", "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-extensions"]) {
    assert.ok(args.includes(flag), `${profile.name} includes ${flag}`);
  }
  assert.strictEqual(optionValue(args, "--model"), profile.model, `${profile.name} uses its default model`);
  assert.strictEqual(optionValue(args, "--system-prompt"), profile.systemPrompt, `${profile.name} uses its system prompt`);
  assert.strictEqual(optionValue(args, "--tools"), profile.tools.join(","), `${profile.name} preserves its tool allowlist`);
  assert.strictEqual(args[args.length - 1], task, `${profile.name} task is last`);
}

// Explicit Luna, Terra, and Sol overrides win over a profile default.
for (const model of ["openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-terra", "openai-codex/gpt-5.6-sol"]) {
  const args = buildChildArgs(verify, "run the tests", model);
  assert.strictEqual(optionValue(args, "--model"), model, `${model} override wins`);
}

assert.strictEqual(childTimeoutMs(), 10 * 60 * 1000, "uses the default child timeout");
assert.strictEqual(childTimeoutMs(20 * 60), 20 * 60 * 1000, "uses the requested child timeout");

console.log("subagents: all assertions passed");
