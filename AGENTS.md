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

## Session Handoff

- At the start of each main session, read the project's `CONTEXT.md` before substantive work. Create it in the project root if missing, or in the working directory when there is no project root. Re-read it after resuming or losing session context.
- Update `CONTEXT.md` at session start with the current goal and relevant carried-over work. Keep it current as work and decisions happen, and update it before the final response, session end, or handoff so another agent can continue without the conversation.
- Record decisions and their reasons, work completed, changed-file references, actual verification results, unfinished tasks, blockers, and next steps. Distinguish proposals from accepted decisions and verified results from assumptions. Do not store credentials or raw conversation/tool dumps.
- Preserve existing entries and unfinished backlog. The file may grow; do not automatically compact, summarize away, delete, or reset its history. Compact or remove entries only when the user explicitly requests it, preserving anything still unresolved.
- The main orchestrator owns handoff updates. Children report their findings and changes instead of editing `CONTEXT.md` unless explicitly assigned that file, avoiding concurrent overwrites. Include the relevant handoff facts in each child's self-contained brief.
- If the file cannot be read or updated, report that limitation rather than claiming the handoff is current. This is an agent responsibility, not a guarantee of shutdown hooks after an abrupt interruption.

## Subagent Dispatch

- Delegate substantive routine investigation, source exploration, web research, and mechanical/grunt work to children to preserve the main session's context. Keep only small targeted lookups and decision-relevant evidence in the orchestrator; do not repeat an entire child's exploration.
- Keep task framing, synthesis, integration decisions, and user discussion in the main session. Use an implementer child for bounded, well-specified work; the main session may implement complex or tightly coupled work itself. Parallelize only independent scopes that do not compete for files or state.
- Brief each child with its goal, absolute paths or sources, relevant context, constraints, acceptance criteria, and required output. Request concise findings, evidence references, uncertainties, and recommendations rather than raw logs. Children do not inherit these standing rules or the main conversation.
- Near the end of every implementation, normally dispatch a fresh independent code-review child regardless of whether the main session or another child wrote the code. Self-review and passing tests do not replace this review. The main orchestrator arranges it because children cannot dispatch children.
- Review correctness, simplicity, and maintainability, including unnecessary abstractions, duplication, and convoluted logic. Prefer concrete simpler alternatives that preserve required behavior, not speculative refactors or style churn. Evaluate findings, address justified concerns, and obtain follow-up review for substantive fixes. Review is the default completion step, not a runtime block on implementation; if it is unavailable or explicitly waived, disclose that and any remaining risk.
- Dispatch specialist perspectives only when the user explicitly requests a named role. They can advise during brainstorming, design, workflow evaluation, or implementation review, not only after coding. Ask for concerns and their impact, concrete remedies, improvements, tradeoffs, and open questions. Specialists advise; the user and main orchestrator make decisions. A specialist opinion does not replace independent code review.
- Route by task: Luna for bounded exploration, mechanical work, verification, or small scoped reviews; Terra for synthesis, implementation, and normal reviews; Sol for architecture, difficult judgment, and deeper reviews. Do not automatically use the strongest model for every review.

Before re-dispatching a failed child, classify the failure. Retry a provider or
transport failure once at the same tier after a readiness probe. For a known
long command, set the bounded child timeout or run only that deterministic
command in the controller. Retry an empty or harness failure once on the same
brief and model, then split the task or collect its artifacts. Escalate models
only when the report identifies a reasoning, integration, or judgment blocker.
Never escalate a model solely because a child timed out.

## Skills and Extensions

Anything not covered above lives in `skills/` and `extensions/` - this file states standing rules, it does not enumerate capabilities.

### Superpowers Preferences

- Use Superpowers only when its guidance fits the task. Its blanket mandatory-use, skill-before-every-response, and full-workflow requirements do not apply. These standing preferences take precedence over conflicting skill instructions or injected reminders; do not modify upstream package files to maintain the override.
- Keep useful prompting, brainstorming, debugging, testing, and review guidance proportional to the work. Small, clear tasks may proceed directly from discussion or brainstorming to implementation. Reserve formal written specs, implementation plans, and their approval ceremony for large, complex, or materially uncertain work, or when the user requests them. Do not create documents solely to satisfy a skill.
- Visual mockups are opt-in. When useful and accepted, keep a persistent HTML file in the project's `.superpowers/` directory, or an existing project-specific location. Evolve one design in place so the user can request refinements; create alternatives only when asked. Record its path in `CONTEXT.md` and do not automatically clean it up when a session, preview server, or brainstorming phase ends.

## Project Files

Project-level AGENTS.md files extend this file; they do not replace it.
