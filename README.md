# picasso - Pi agent harness

Personal Pi agent configuration: guarded execution, isolated subagents, a verify-before-push gate, template-driven git text, and read-only external repo review. Lives at `~/.pi/agent`.

## Layout

- `AGENTS.md` - standing rules loaded into every session; `CLAUDE.md` symlinks to it. Its `## Verification` section is what the push gate runs.
- `extensions/`
  - `bash-guard/` - screens bash tool calls: confirm dialog interactively, hard-blocks the catastrophic subset in headless subagents.
  - `subagents/` - `subagent` tool for isolated child Pi processes. Its README defines the approved profiles, tool lists, briefing rules, and model routing.
  - `push-gate/` - `/push-gate <branch>`: runs AGENTS.md verification commands, pushes, and opens a PR only if all pass.
  - `web-fetch/` - installed `web_fetch` extension for explicitly requested named-source fetching. It is not arbitrary web search or a JavaScript browser.
- `skills/`
  - `git-messages/` - fixed templates plus renderer for commit messages, PR bodies, and issue bodies. No invented content, no omitted sections, dash not em dash.
  - `comment-style/` - deterministic comment pattern for placement, form, and substance, adapted to project rules and native language syntax.
  - `repo-review/` - read-only external repo inspection using shallow clone and grep only, never execute; review outputs go to the shared artifact root.
  - `retro/` - `/retro` (explicit only): session lessons as real diffs, applied only on accept.
- `lib/output-dir.ts` - shared artifact output root resolver: `PI_OUTPUT_DIR`, else `~/Documents/pi/` when a Documents folder exists, else `~/.pi/output/`. Extension and skill artifacts, including web fetches, xlsx analyses, and repo reviews, are written here as dated, self-contained markdown, never inside this repo.
- `prompts/` - slash-command prompt templates such as `/retro`.
- `templates/` - `AGENTS.md.template` for instantiating per-project agent files.
- `tests/` - assertion suites, run via `bin/test`.

## Approved workflow

The parent agent frames the task, reasons about the solution, and integrates child results. It delegates routine investigation and grunt work when that preserves its context. A bounded, clear implementation can go to a child; complex integration stays with the parent when broad architectural context is needed.

Use a fresh independent review near the end regardless of who authored the change. There is no hard runtime gate when review is unavailable. Evaluate findings against the task and behavior rather than applying them blindly, and disclose an unavailable review.

Children start without session, context files, skills, prompt templates, or ordinary extensions. Their briefings must include the relevant project context because context is not inherited. The parent owns project `CONTEXT.md`, updates its handoff at the start and end, and integrates child reports. Children do not concurrently edit `CONTEXT.md` or other shared files unless explicitly assigned.

The subagent workflow uses `--no-session --no-context-files --no-skills --no-prompt-templates --no-extensions`, followed only by trusted explicit `bash-guard` and, when requested by the tool list, the installed `web-fetch` extension. No child dispatches another child. This controls the child tool surface; it is not an OS sandbox. `web_fetch` saves shared artifacts automatically, so an investigate child is not a zero-write OS sandbox.

See `extensions/subagents/README.md` for the exact `investigate`, `specialist`, `implement`, `verify`, and `review` contracts.

## Context handoff and compaction

Treat project `CONTEXT.md` as the parent's durable handoff. Read it at session start and create it if missing. Update it at the start, as work and decisions happen, and before session end or handoff; give children the relevant facts in every briefing. The file may grow. Preserve its history and unfinished backlog; compact, summarize away, or remove entries only when the user explicitly requests it. These are standing agent instructions, not automatic file-maintenance or shutdown hooks.

## Selective Superpowers

Use Superpowers proportionally, not as a mandatory ceremony. For large work, write a spec and plan before implementation. Mockups are persistent opt-in artifacts: keep one evolving project-local `.superpowers/` HTML mockup until explicit cleanup instead of creating disposable copies. `AGENTS.md` houses the actual policy; this README only records the workflow boundary.

## Verification

```
bin/test
```

## Model routing

Codex is the default model family. Use Luna for bounded investigation, verification, and small scoped review; Terra for normal implementation, synthesis, and review; and Sol for architecture, hard judgment, and deep final review. Do not route every review to the strongest model automatically.

The explicit `opencode-go/deepseek-v4-flash` override remains approved for suitable dispatches. Do not use stale Copilot or unsupported OpenCode model defaults. See the subagents README for the full approved route list and profile tool surfaces.

## Browser and MCP boundary

Pi supports MCP in general, but child processes intentionally receive no MCP or browser tools because their extension selection is isolated. Use the installed `web_fetch` extension only for explicitly requested named-source fetching. It requires no package or global settings change, is not arbitrary web search, and is not a JavaScript browser.

For browser-specific work, keep the standalone Node script pattern with installed or already cached Playwright tooling and an already installed browser path. Do not use `npx` to fetch or install tooling, do not run `npm install`, and do not download a second browser without explicit approval. The child must still receive `bash` explicitly, and the script's output must be reported as evidence.

## Notes

- Push policy for this repo: verify, then push to main directly.
