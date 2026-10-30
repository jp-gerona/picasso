# Pi agent handoff

## Current goal

Refine the personal Pi workflow in `/Users/JP/.pi/agent` to preserve the main session's context, delegate routine work, obtain independent implementation reviews, and keep durable session handoffs.

## Current status

The workflow changes are implemented, integrated, independently reviewed, and verified. The user has now requested commit and push, including checking the pre-existing Herdr update and untracked runtime folder; publication is in progress. New sessions will receive the updated standing instructions; run `/reload` in an existing Pi session to register the new profiles and dispatch description. Review and handoff maintenance remain agent responsibilities rather than hard runtime enforcement.

## Accepted decisions

- The main session frames tasks, synthesizes findings, discusses choices with the user, and handles complex integration. Bounded, well-specified implementations may go to a child.
- Delegate routine investigation, source exploration, web research, and grunt work. Child reports should be concise, evidence-backed, and explicit about uncertainty.
- Normally request independent code review near the end of every implementation, regardless of author. Focus on correctness, clean and simple logic, and maintainability. This is an instruction-led workflow, not a runtime implementation gate. Evaluate suggestions rather than accepting them blindly.
- Specialist roles are explicitly user-requested perspectives, not automatic personas. They can critique brainstorming, design, workflows, and implementations. A Data Analyst can advise on dashboard metrics, data quality, missing data, and misleading interpretations, with concrete remedies and improvements. The user and orchestrator retain decisions.
- Use Luna, Terra, and Sol according to task complexity, including reviews. Sol is not required for every review. Existing approved DeepSeek overrides remain available.
- Use Superpowers selectively, not before every action. Small work can move directly from brainstorming to implementation. Formal specs and plans are for substantial or materially uncertain tasks, or explicit user requests.
- Mockups are opt-in, persistent project-local HTML, normally one evolving design in `.superpowers/`. Do not automatically remove them. No mockup was requested for this task.
- Read/create and update project `CONTEXT.md` at session start, throughout meaningful work and decisions, and before session end or handoff. Preserve growing history and backlog; compact or remove entries only on explicit user instruction. The main orchestrator owns updates unless a child is explicitly assigned the file.

## Work log

### Workflow refinement - implementation in progress

- Inspected the existing `implement`, `verify`, and `review` profiles through delegated investigations. Children are isolated and cannot recursively dispatch or inherit parent context, skills, or standing instructions.
- Baseline verification via a verification child: `bin/test` passed all seven existing assertion suites before changes.
- A code implementer updated `extensions/subagents/args.ts`, `extensions/subagents/index.ts`, the existing agent profiles, and `tests/subagents.test.ts`; added `investigate.json` and `specialist.json` under `extensions/subagents/agents/`.
- A separate documentation child updated `README.md` and `extensions/subagents/README.md`. Its runtime-mismatch note came from a concurrent snapshot before the profile changes completed and needs integration checking.
- Updated `AGENTS.md` with delegation, independent review, explicit specialist roles, selective Superpowers, persistent mockups, and session handoff ownership and retention rules.
- Investigator design: read/search tools plus the installed `web_fetch` extension loaded explicitly only for children whose allowlist requests it. No shell or project-editing tools. Fetching URLs is not a general web search capability; fetched results can write shared extension artifacts.
- Implementer reported test-first failure because the new investigator profile did not yet exist, then passing subagent assertions after implementation. Final integrated verification and independent review are still pending; do not treat this as final completion evidence.

## Pre-existing unrelated work

- `extensions/herdr-agent-state.ts` was already modified before this task. Preserve it and do not include it as part of this implementation's claims.
- `install/` was already untracked. Preserve it; it contains the installed Pi runtime and documentation used for this task.
- Delegated investigation observed an untracked upstream `git/github.com/obra/superpowers/package-lock.json`; do not modify upstream package files.

## Integration checklist recorded before final verification

- Inspect and integrate all delegated changes, including selective child web-fetch loading and profile descriptions.
- Run a real isolated investigator smoke test for source evidence and public-URL fetching; verify specialist role behavior with an explicitly requested Data Analyst perspective and absence of an assigned role.
- Run `bin/test` and whitespace checks after integration.
- Request a fresh independent subagent code review of the full task scope, resolve justified findings, and repeat verification as needed.
- Update this handoff with actual final verification, review outcomes, and any capability limits. Explain reload requirements for new profiles and note that context maintenance and review are instruction-led, not hard runtime enforcement.

### Workflow refinement - final verification and review

The integration checklist above is now resolved; it is retained as work history.

- Inspected and integrated the delegated changes. Corrected the tool description to use the actual `investigate` profile name and exact provider/model IDs, corrected documentation to reflect that bash-guard is always loaded, preserved the repo's push policy, and added assertions for default-model and system-prompt propagation.
- Fresh independent Terra review returned: `APPROVE - No actionable issues found in the reviewed scope.` It covered policy, docs, all profiles, argument construction, dispatch description, and tests. No code changes were made after this review.
- Final `bin/test` run passed all seven suites: bash-guard, command-aliases, git-messages, output-dir, safe-path, subagents, and usage-limits. Actual suite output was observed, not only the implementer's claim.
- `git diff --check` passed. A verification child also reported successful Node syntax checks for `args.ts` and `index.ts`, and no prohibited punctuation in changed policy, docs, and profiles.
- Real isolated investigator run successfully executed `read` and `web_fetch`, fetched `https://www.rfc-editor.org/rfc/rfc2606.txt`, and returned source evidence, the fetched document title, shared-artifact reference, and the absence of general web-search capability. Its JSON event trace confirmed both tools succeeded and only allowed tools ran.
- The first fetch smoke test used `https://example.com`; the existing extractor rejected its short content as incomplete. Diagnostic events confirmed the tool was loaded and callable. A substantive RFC text fixture passed without any extractor or runtime change. Do not mistake the rejected fixture for a general web-fetch failure.
- Specialist contract smoke tests passed: without a named user-requested role it returned exactly `NEEDS_ROLE`; a synthetic explicit Data Analyst request produced practical dashboard concerns, remedies, tradeoffs, and decision questions without inventing a dataset or making the final choice.
- A fresh Pi process loading the actual subagents extension successfully dispatched the new `investigate` profile and returned its source-backed report. Existing sessions still need `/reload` to refresh the startup-loaded agent map.
- No packages were installed, settings changed, upstream Superpowers files modified, or commits created. Pre-existing unrelated work remains outside this task.

## Capability limits and future options

- `web_fetch` retrieves known or discovered URLs; there is no general search provider in the investigator's toolset. It writes fetched artifacts to the shared output root and does not provide an OS sandbox or browser.
- Broader search integration, hard review enforcement, and automatic lifecycle-based handoff updates were not requested or implemented. Do not silently expand this into an orchestration rewrite.
- Preserve this handoff and its history. There is no request to compact it or delete completed entries.

### Commit and push - inspection and scope

- The user explicitly authorized committing and pushing, and asked whether to include the existing Herdr change and `install/` folder.
- Repository is on `main`, with `origin` at `https://github.com/jp-gerona/picasso.git`. Nothing was staged when this publication task began.
- Delegated inspection confirmed `install/` is a 295 MB managed Pi runtime containing releases, staging, and machine-local installation metadata. Exclude it from version control; added `/install/` to `.gitignore` without deleting the installation.
- The already tracked `extensions/herdr-agent-state.ts` has a generated Herdr integration version 8-to-9 update: it imports `node:path` and accepts POSIX or Windows absolute session paths instead of only strings beginning with `/`. The diff introduces no hardcoded machine-local values. Include this existing generated update as a separate commit; do not hand-edit the Herdr-managed file.
- Next steps: verify the Herdr update and full suite, obtain independent review of the additional scope, commit the workflow/hygiene changes and generated Herdr update separately, and push without force after checking remote state.

### Commit and push - pre-publication verification

- Fresh `bin/test` run passed all seven suites. Node syntax checks passed for the generated Herdr integration and both subagent runtime files; `git diff --check` passed.
- `git check-ignore -v` confirmed `/install/` excludes `install/current-version` and `install/managed-install.json`. The managed runtime is no longer offered as untracked content for staging.
- A real Unix-socket protocol smoke test exercised the actual Herdr `session_start` handler. All seven cases passed: POSIX absolute paths, Windows drive-absolute paths, Windows UNC paths, relative paths, drive-relative paths, missing paths, and throwing path getters. Invalid/unavailable paths fell back to the session ID. This tested Windows path syntax on the current host, not a Windows operating-system run.
- A fresh independent Terra review approved the generated Herdr change and the additional ignore/handoff scope. The Herdr-managed source was not hand-edited.
- `git fetch origin` succeeded. Before creating commits, `HEAD...origin/main` reported `0 0`: no remote-only or local-only commits to reconcile. Proceed with ordinary pushes, never force-push.
