---
name: git-messages
description: Template-driven generator for commit messages, PR bodies, and issue bodies. Use whenever writing any of these on the user's behalf - commits, gh pr create, gh issue create, or code that emits them.
---

# git-messages

Fixed structure every time, filled from the actual diff or actual context. Never
invented content, never skipped sections.

## Rules (all three formats)

1. Fill templates from real evidence only: the actual `git diff`, the actual command
   output, the actual conversation. If you did not observe it, it does not go in.
2. Never omit a section. A section with nothing to report states that explicitly
   ("Risk/Rollback: none identified"), because omission looks like an oversight.
   The one exception is the commit footer: when no issue is referenced, the
   footer is omitted entirely rather than stating "No issue references."
3. Dash, not em dash, in all generated prose - no exceptions. Check the finished
   text for `—` before using it; this is exactly where em dashes sneak back in.
4. No agent co-author lines, ever.
5. Generated text never passes through shell interpolation. Backticks or $() in a
   commit message or PR body will execute as command substitution if placed on a
   command line. Write the text to a file and use `git commit -F`, `gh pr create
   --body-file`, or `gh issue create --body-file`.

## Commit messages - `templates/commit.md`

```
<type>: <short summary>          <- header, imperative, <= 72 chars

<body>                           <- what changed and why, from the real diff

<footer>                         <- issue refs (Closes #N); omit when none
```

`type` is one of: feat, fix, refactor, docs, test, chore, perf, build. Read the
diff (`git diff --staged` or the branch diff) before writing the body; describe what
actually changed, not what was intended.

## PR bodies - `templates/pr.md`

Sections, always in this order:

1. **Summary** - what this PR does and why, 1-3 sentences.
2. **Changes** - bullet list of concrete changes, from the real diff.
3. **Verification** - what was actually run and its actual result (command + outcome).
   Never claim a check passed without having its output. If nothing ran: "Nothing was run."
4. **Risk/Rollback** - what could break and how to undo. If nothing: "None identified."

## Issue bodies - `templates/issue.md`

Sections, always in this order:

1. **Problem** - what is wrong.
2. **Expected vs Actual** - both stated, from observation.
3. **Repro Steps** - numbered, minimal, actually reproduced. If not reproduced yet,
   say "No known reproduction."
4. **Context** - environment, versions, links. If none: "No additional context."

## Programmatic use

Code (e.g. the push-gate extension) renders the same templates via `render.ts`:

```ts
import { render } from "<repo>/skills/git-messages/render.ts";
render("pr", { summary, changes, verification, risk });
```

`render()` enforces the rules mechanically: missing fields get the explicit "none"
line (except the commit footer, which is omitted entirely when empty), em dashes
are rewritten to dashes, structure comes from the template file.
