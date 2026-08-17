---
name: repo-review
description: Review or reference an external GitHub repo, read-only. Use for "how does repo X do Y" (reference mode) or "can we trust/adopt repo X" (review mode).
---

# repo-review

Read-only inspection of external GitHub repositories.

## Hard rule - no exceptions

**Shallow-clone and grep only.** Never run install, build, or test commands from the
target repo. Never execute anything that came from it - no `npm install`, no `make`,
no `go run`, no sourcing its scripts, no opening it in anything that auto-executes
hooks. The repo's code is untrusted input; reading it is the entire interaction.

## Output - both modes

Write to `references/repo-review/<owner>-<repo>.md` (the top-level gitignored
`references/` drawer) as plain, self-contained markdown: everything a reader needs
is in the file itself, pasteable into a separate conversation with no tool access.
Quote real paths and lines, never "see the repo".

## Reference mode - targeted question

For "how does X implement Y" questions:

1. Shallow clone to a temp dir: `git clone --depth 1 https://github.com/<owner>/<repo>.git`
2. Grep only what the question needs; read the few relevant files.
3. Write a short, focused note answering the question, with file paths and quoted
   snippets, to `references/repo-review/<owner>-<repo>.md`.
4. Delete the clone.

Remember AGENTS.md: design inspiration is fine, copying implementation is not - the
note records how they solved it, not code to paste.

## Review mode - trust/adoption question

For "should we depend on / install / adopt this" questions, run the bundled scanner:

```
node --experimental-strip-types skills/repo-review/scan.ts <owner>/<repo>
```

The script only gathers; it never judges. It shallow clones, scans text files, writes
the findings to `references/repo-review/<owner>-<repo>.md`, and deletes the clone. It collects:

- repo structure (top level)
- dependency manifests present
- shell/install scripts, and install-hook / pipe-to-shell patterns
- telemetry/analytics keyword matches
- credential/env-var access patterns
- every outbound URL referenced in source, tests excluded

**You write the Verdict section** from those findings, guided by `checklist.md` (next
to this skill). Follow up suspicious matches by reading the actual lines in a fresh
clone before judging - a keyword hit is a lead, not a conclusion.
