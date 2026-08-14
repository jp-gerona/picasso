# subagents

A Pi extension providing a `subagent` tool: dispatch tasks to isolated child Pi
processes for the develop -> verify -> review loop (superpowers'
subagent-driven-development).

## Isolation model

Each dispatch spawns `pi -p` fresh:

- `--no-session --no-context-files --no-skills --no-prompt-templates` - the child
  inherits nothing from the calling session. Every task string must be
  self-contained: absolute paths, complete instructions, success criteria.
- `--no-extensions -e <bash-guard>` - the only extension loaded is bash-guard, which
  runs in its headless path (print mode has no UI), hard-blocking catastrophic
  commands. The subagents extension itself is never loaded in children, so subagents
  cannot recurse.
- `--tools`, `--model`, `--system-prompt` come from the agent config, with `--model`
  overridable per dispatch (see Model routing).

## Modes

- Single task: `{ agent, task, model? }`
- Parallel: `{ tasks: [{ agent, task, model? }, ...] }` - fixed worker pool, max
  concurrency 4, results returned in input order. Per-task timeout 10 minutes.

## Model routing

Every dispatch takes an optional `model` override (`provider/model-id`). Omit it to
use the agent's configured default. Pick the cheapest model that can do the job:

| Tier | Model | Use for |
|---|---|---|
| Mechanical | `opencode-go/deepseek-v4-flash` or `opencode-go/gpt-5.6-luna` | 1-2 files, fully specified, transcription, test runs |
| Standard | `opencode-go/deepseek-v4-pro` | multi-file integration with a clear spec |
| Complex | `opencode-go/kimi-k2.7-code` or `opencode-go/kimi-k3` | multifile coordination, subtle logic |
| Hardest / final review | `opencode-go/qwen3.8-max` or `opencode-go/kimi-k3` | architecture, whole-branch review, fix-loop escalation |

The main session (brainstorm/spec/plan + orchestration) runs on
`opencode-go/qwen3.8-max`, set as the default model in `settings.json`.

## Agent configs

Data, not code: one JSON file per agent in `agents/`, loaded at startup.

```json
{
  "name": "verify",
  "description": "Runs tests/lint via bash and reports pass/fail with evidence",
  "model": "opencode-go/deepseek-v4-flash",
  "tools": ["bash"],
  "systemPrompt": "..."
}
```

Starter agents:

| Agent | Model (default) | Tools | Role |
|---|---|---|---|
| implement | `opencode-go/deepseek-v4-pro` | read, write, edit, bash | write code for a fully specified task |
| verify | `opencode-go/deepseek-v4-flash` | bash | run tests/lint, report PASS/FAIL with output |
| review | `opencode-go/qwen3.8-max` | read, grep | review a diff against stated criteria, no write access |

Add a new agent by dropping another `.json` in `agents/` and reloading.

## Model availability

Probe a model before wiring it into a config - auth that looks configured can
still fail (provider `not_ready`, exhausted credits, plan-restricted models that
400 only at request time):

```
pi -p --no-session --no-tools --model <provider/model> "Reply with exactly: ok"
```

A config pointing at a dead model fails every dispatch at runtime with a provider
error, not at load time.

Known on this setup: `opencode-go` serves all ladder models; `github-copilot`
only serves `gpt-4.1` (its other listed models return `model_not_supported`).
