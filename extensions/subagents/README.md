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

## Browser / MCP work runs as a CLI script, not through the MCP

Children get only the tools listed in their agent config - today that is bash,
plus read/write/edit for implement. No child has an MCP or a browser tool, and Pi
has no MCP server integration, so "drive it with the Playwright MCP" cannot be
handed to a subagent. Do not wire an MCP for this. The token-efficient pattern is
a standalone Node script the child runs with `bash`:

- The main session writes the Playwright script (assertions, selectors, login)
  into a scratch file and dispatches the child to run it and report the output.
- Resolve `playwright` from the npx cache with `createRequire`, or run the script
  via `npx playwright`. Do not `npm install` a second copy.
- Pin `executablePath` to the already-installed browser. The npx-cached playwright
  build and the cached chromium can drift versions: playwright 1.61.x asks for
  chromium 1237 while the machine carries 1228, and the launch then fails with
  "Executable doesn't exist". Pointing at the 1228 headless shell binary fixes it
  without a large download.
- Prefer `waitUntil: 'domcontentloaded'` and `waitForSelector(..., { state:
  'attached' })`. Pages that live-poll never reach `networkidle`, and a hidden
  `<script type="application/json">` is invisible to the default visible wait.
- Clear any single-session state before the script logs in, or the app answers
  "Already Signed In" and the child reports a timeout as a product bug.
- Do not drive the browser with `playwright-cli` (`@playwright/cli@0.1.18`, alpha).
  `open` crashes with "Target crashed / Assertion error" in `_CRSession._onMessage`
  with the bundled chromium, a pinned `executablePath`, and `--browser chrome`
  alike, so the script pattern above is the working path. Revisit only when the
  CLI ships a stable release.

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
