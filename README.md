# picasso - Pi agent harness

Personal Pi agent configuration: guarded execution, isolated subagents, a
verify-before-push gate, template-driven git text, and read-only external repo
review. Lives at `~/.pi/agent`.

## Layout

- `AGENTS.md` - standing rules loaded into every session; `CLAUDE.md` symlinks to
  it. Its `## Verification` section is what the push gate runs.
- `extensions/`
  - `bash-guard/` - screens bash tool calls: confirm dialog interactively,
    hard-block of the catastrophic subset in headless subagents.
  - `subagents/` - `subagent` tool: isolated child Pi processes (single or
    parallel, concurrency 4), agent configs as JSON in `agents/`.
  - `push-gate/` - `/push-gate <branch>`: runs AGENTS.md verification commands,
    pushes and opens a PR only if all pass.
- `skills/`
  - `git-messages/` - fixed templates + renderer for commit messages, PR bodies,
    issue bodies; no invented content, no omitted sections, dash not em dash.
  - `repo-review/` - read-only external repo inspection (shallow-clone and grep
    only, never execute); review outputs in `references/`.
  - `retro/` - `/retro` (explicit only): session lessons as real diffs, applied
    only on accept.
- `prompts/` - slash-command prompt templates (`/retro`).
- `templates/` - `AGENTS.md.template` for instantiating per-project agent files.
- `tests/` - assertion suites; also the AGENTS.md verification commands.

## Verification

```
node --experimental-strip-types tests/bash-guard.test.ts
node --experimental-strip-types tests/git-messages.test.ts
```

## Notes

- Subagent model configs currently point at `github-copilot/gpt-4.1` (only model
  answering on the current plan); probe before swapping - see
  `extensions/subagents/README.md`.
- Push policy for this repo: verify, then push to main directly.
