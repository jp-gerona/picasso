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

Write to `<output-root>/repo-review/<owner>-<repo>.md`, where the output root is
`~/Documents/pi/` by default (`PI_OUTPUT_DIR` env var overrides; see
`lib/output-dir.ts`). This keeps generated artifacts out of the tracked
config repo while staying visible in Finder. Write plain, self-contained markdown:
everything a reader needs is in the file itself, pasteable into a separate
conversation with no tool access. Quote real paths and lines, never "see the repo".

## Reference mode - targeted question

For "how does X implement Y" questions:

1. Shallow clone to a temp dir: `git clone --depth 1 https://github.com/<owner>/<repo>.git`
2. Grep only what the question needs; read the few relevant files.
3. Write the note, with file paths and quoted snippets, to
   `<output-root>/repo-review/<owner>-<repo>.md`. Answer the literal question,
   but cover the mechanism chain around it: the stack, where the data comes
   from and how it is acquired/updated, how the key visuals are actually
   rendered (geometry source, layering), and any plugin/extension surface.
   Follow-up questions almost always probe one of these gaps.
4. Keep the clone until the session's questions on this repo are done -
   follow-ups must not re-clone. Delete it when the user moves on.
5. Open the note with one Trust context line, gathered for free while reading:
   license, last-commit age / maintenance signals seen in the tree, and whether
   a review-mode scan verdict exists at `<output-root>/repo-review/`. Reading
   is safe under the rules above, but the user may later adopt what the note
   teaches - the note must not become a blind spot. If the user signals
   adoption intent (installing, depending on, or running the repo), recommend
   running review mode first.

Remember AGENTS.md: design inspiration is fine, copying implementation is not - the
note records how they solved it, not code to paste.

## Review mode - trust/adoption question

For "should we depend on / install / adopt this" questions, run the bundled scanner:

```
node --experimental-strip-types skills/repo-review/scan.ts <owner>/<repo>
```

The script only gathers; it never judges. It shallow clones, scans text files, writes
the findings to `<output-root>/repo-review/<owner>-<repo>.md`, and deletes the clone. It collects:

- repo structure (top level)
- dependency manifests present
- shell/install scripts, and install-hook / pipe-to-shell patterns
- telemetry/analytics keyword matches
- credential/env-var access patterns
- every outbound URL referenced in source, tests excluded

**You write the Verdict section** from those findings, guided by `checklist.md` (next
to this skill). Follow up suspicious matches by reading the actual lines in a fresh
clone before judging - a keyword hit is a lead, not a conclusion.
