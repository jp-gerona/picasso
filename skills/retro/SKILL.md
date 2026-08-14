---
name: retro
description: Session retrospective, explicit /retro trigger only - never automatic, never on a timer. Turns this session's lessons into concrete diffs against AGENTS.md, skills, and checklists, applied only after explicit accept.
---

# retro

Capture what this session taught, as real file edits - not advice.

**Trigger discipline:** run only when the user types `/retro`. Never self-trigger,
never suggest running it, never schedule it.

## Step 1 - gather evidence (cheap)

Look at diffs and outcomes, not the full transcript:

- `git log --oneline -15` and `git diff --stat HEAD~5..HEAD 2>/dev/null` - what
  actually changed this session.
- Recall from the session: commands that failed and why, guard blocks, wrong
  first attempts that needed a second commit, anything the user corrected you on.

Skip anything that went smoothly - retro captures friction, not history.

## Step 2 - propose edits as a real diff

For each lesson, pick the one file where it belongs:

- A standing behavioral rule -> `AGENTS.md` (only if it applies to every session;
  this file is loaded always and earns its place one rule at a time).
- A workflow lesson -> the relevant `skills/*/SKILL.md` or a new skill.
- A trust/review lesson -> `skills/repo-review/references/checklist.md` row.
- A subagent hand-off lesson -> the agent config's systemPrompt in
  `extensions/subagents/agents/*.json`.

Then produce an actual unified diff against the real files. Mechanics: copy the
target files to a scratch dir, apply the edits there, run
`diff -u <original> <edited>` (or edit in place on a throwaway `git stash`-able
state and show `git diff`). The user must see exact old/new lines, not prose like
"consider adding".

Keep it small: 1-3 edits max per retro. No lesson = say so and stop; never invent
a finding to justify the run.

## Step 3 - wait for explicit accept

Show the diff. Ask accept/decline per edit. **Write nothing until accepted.**
Decline = discard, no argument, no re-proposing the same edit next retro.

## Step 4 - on accept, apply and commit

Apply the accepted edits, run the AGENTS.md verification commands, then commit
using the git-messages commit template (`skills/git-messages`): type `chore` or
`docs`, body stating what changed and why the session justified it. Push per the
repo's push policy.

## Cost discipline

This must run fine on Pi's cheap default model: no full-transcript rereads, no
subagent dispatches, no repo-wide scans. Evidence is git history plus what is
already in context.
