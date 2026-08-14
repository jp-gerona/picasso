# push-gate

The push/PR gate: a branch may leave the machine only after the project's own
verification commands all pass.

## Flow

1. Takes a branch that is ready for review (must already be checked out; the gate
   never switches branches, and refuses `main`/`master`).
2. Reads verification commands from the project's `AGENTS.md` - every backticked
   bullet or fenced-code line under a `## Verification` heading. No hardcoded stack
   assumptions; no section means no push.
3. Runs each command in order. First non-zero exit stops the gate: nothing is
   pushed, and the report names the exact failing command, its exit code, and the
   tail of its output.
4. All green: `git push -u origin <branch>`, then `gh pr create`. The PR body is
   rendered by the git-messages template system (`skills/git-messages`) from the
   branch's real commits, diff stat, and the checks the gate just ran.

## bash-guard integration

Every command the gate executes (checks, git, gh) is screened by bash-guard's
`assess()` first. Interactive sessions confirm risky commands via dialog; headless
runs abort on critical findings. `git push` without `--force` is caution-tier, so
the normal happy path never needs a bypass.

## Usage

- Inside Pi: `/push-gate <branch>`
- Standalone: `node --experimental-strip-types extensions/push-gate/index.ts <branch> [cwd]`
