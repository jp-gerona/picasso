# bash-guard

A Pi extension that inspects every `bash` tool call before it executes and either asks
for confirmation or blocks it outright, depending on how dangerous the command looks
and whether anyone is present to answer a dialog.

## Scope

- Intercepts the **bash tool only**. File edits/writes go through their own tools and
  are not touched. Commands the user types with the `!` prefix fire Pi's `user_bash`
  event, not `tool_call`, so they bypass the guard by design - the user typed them.
- Zero dependencies. Command strings are split by a small built-in quote-aware
  tokenizer, not a third-party shell parser.

## Modes

| Session | Critical tier | Caution tier |
|---|---|---|
| Interactive (`ctx.hasUI`) | confirm/abort dialog | confirm/abort dialog |
| Headless (subagent, print mode) | **hard-blocked, no prompt** | allowed |

Headless sessions have no one to answer a dialog, so silently blocking the
catastrophic subset is the only safe option. The block reason tells the subagent to
escalate to the main session if the command is genuinely needed.

## Critical tier (blocked headless, prompted interactively)

- **Recursive or forced deletion**: `rm -r` / `rm -f` (any spelling of the flags),
  `find ... -delete`, `shred`, `srm`. These destroy data with no undo.
- **Privilege escalation**: `sudo`, `doas`. An unattended agent should never
  self-elevate; the wrapped command is also inspected on its own merits.
- **Disk and filesystem tools**: `mkfs*`, `fdisk`, `parted`, `gpart`, `gdisk`,
  `sgdisk`, `newfs`, `mkswap`, `diskutil eraseDisk/eraseVolume/partitionDisk/
  zeroDisk/reformat`, and `dd` with `of=/dev/...`. One wrong argument erases a drive.
- **Pipe-to-shell**: `curl`/`wget`/`fetch` piped into `sh`/`bash`/`zsh`/etc.
  Executes remote content sight unseen.
- **Git history rewrite or discard**: `rebase`, `filter-branch`, `filter-repo`,
  `reflog`, `reset --hard`, `push --force`/`-f`/`--force-with-lease`, `clean -f`,
  `branch -D`, `checkout -- <path>`. All of these can permanently lose commits or
  local work.
- **Infra teardown**: `terraform destroy/apply`, `pulumi destroy/up`,
  `kubectl delete/drain`, `helm uninstall`, `aws delete-*/terminate-*`,
  `gcloud ... delete`, `az ... delete`, `docker rm/rmi/prune`. These act on shared,
  often production, resources.

## Caution tier (prompted interactively, allowed headless)

- **Any other git command** (`git commit`, `git push`, `git checkout <branch>`, ...).
  Git mutates repository state worth a glance, but a plain git command is not
  catastrophic enough to strand a headless subagent over.

## Detection notes

- The tokenizer splits on unquoted `|`, `||`, `&&`, `;`, `&`, and newlines, and treats
  `$(...)`, backticks, and subshell parens as fresh command segments - so
  `echo $(rm -rf /)` and `true && sudo whoami` are still caught.
- Wrapper commands (`env`, `nohup`, `time`, `xargs`, `sudo`) are unwrapped and the
  inner command re-checked.
- Pipe-to-shell fires only when the pipe's producer is a downloader, so
  `cat script.sh | bash` of a local file does not trip it, `curl ... | bash` does.

## Declined-command memory

When you decline a command interactively, its exact text is remembered for
**5 minutes**. Retrying the identical command in that window is blocked immediately
with an explanatory reason instead of re-prompting, which stops decline/retry loops.
A changed command (even by one character) prompts again.

## Install

Add to `settings.json`:

```json
{
  "packages": ["extensions/bash-guard/index.ts"]
}
```
