# subagents

A Pi extension providing a `subagent` tool: dispatch tasks to isolated child Pi
processes for the develop -> verify -> review loop.

## Isolation model

Each dispatch spawns `pi -p` fresh:

- `--no-session --no-context-files --no-skills --no-prompt-templates` - the child
  inherits nothing from the calling session. Every task string must be
  self-contained: absolute paths, complete instructions, success criteria.
- `--no-extensions -e <bash-guard>` - the only extension loaded is bash-guard, which
  runs in its headless path (print mode has no UI), hard-blocking catastrophic
  commands. The subagents extension itself is never loaded in children, so subagents
  cannot recurse.
- `--tools`, `--model`, `--system-prompt` come from the agent config.

## Modes

- Single task: `{ agent, task }`
- Parallel: `{ tasks: [{ agent, task }, ...] }` - fixed worker pool, max concurrency 4,
  results returned in input order. Per-task timeout 10 minutes.

## Agent configs

Data, not code: one JSON file per agent in `agents/`, loaded at startup.

```json
{
  "name": "verify",
  "description": "Runs tests/lint via bash and reports pass/fail with evidence",
  "model": "anthropic/claude-fable-5",
  "tools": ["bash"],
  "systemPrompt": "..."
}
```

Starter agents:

| Agent | Tools | Role |
|---|---|---|
| implement | read, write, edit, bash | write code for a fully specified task |
| verify | bash | run tests/lint, report PASS/FAIL with output |
| review | read, grep | review a diff against stated criteria, no write access |

Add a new agent by dropping another `.json` in `agents/` and reloading.
