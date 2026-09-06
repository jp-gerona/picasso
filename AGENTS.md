# Global Agent Guidelines

Standing rules for every agent session, regardless of task or project.

## General Guidelines

- Use a dash (-), never an em dash, in any generated text. No exceptions.
- Never copy code verbatim from reference or third-party repositories. Drawing design inspiration is fine; copying implementation is not.
- Never claim a command succeeded, a test passed, or a bug is fixed without running it and showing the output.
- Weight technical decisions toward quality, simplicity, robustness, and long-term maintainability - not development cost.
- Never add the agent as a commit co-author.
- Reproduce every bug end-to-end before fixing it, as close to how an end user would hit it as possible, so the fix targets the real problem rather than a guess.
- Never hand-edit auto-generated files (e.g. CHANGELOG.md). Fix the generator or its input, not the output.
- No change-narration comments ("added for", "changed to"). Git has history. Comments only for durable why: invariants, non-obvious external contracts.
- If you notice a lint failure or flaky test while working on something else, fix it - don't leave it because it wasn't the assigned task.
- Never install packages or tools (pip, npm, brew, etc.) without explicit approval; prefer installed extensions first and state the gap before reaching for a script.
- Default to installed extensions and built-in tools first - map intent to the right tool without making the user name it; ad-hoc scripts are a last resort.
- Only produce derived deliverables (docx, pdf, polished reports) when explicitly asked; analysis lives in chat plus the one machine-generated report.

## Verification

- Run the full test suite with `bin/test` (every `tests/*.test.ts`, fails fast).
- settings.json is untracked runtime state; mirror durable changes into settings.example.json

## Subagent Dispatch

Before re-dispatching a failed child, classify the failure. Retry a provider or
transport failure once at the same tier after a readiness probe. For a known
long command, set the bounded child timeout or run only that deterministic
command in the controller. Retry an empty or harness failure once on the same
brief and model, then split the task or collect its artifacts. Escalate models
only when the report identifies a reasoning, integration, or judgment blocker.
Never escalate a model solely because a child timed out.

## Skills and Extensions

Anything not covered above lives in `skills/` and `extensions/` - this file states standing rules, it does not enumerate capabilities.

## Project Files

Project-level AGENTS.md files extend this file; they do not replace it.
