# subagents

A Pi extension providing a `subagent` tool for isolated child Pi processes. Use it for the develop, verify, and review loop without giving every child the parent's context or tool surface.

## Isolation model

Each dispatch starts a fresh `pi -p` process. The child receives no calling-session context, so every task must be self-contained: use absolute paths, include the relevant project context, and state explicit success criteria.

Children always use these isolation flags:

```
--no-session --no-context-files --no-skills --no-prompt-templates --no-extensions
```

After `--no-extensions`, load only trusted explicit extensions. `bash-guard` is always loaded, including for profiles without `bash`. The installed `web-fetch` extension is loaded only when the requested tool list includes `web_fetch`. The subagents extension itself is never loaded in a child, so children cannot dispatch nested children.

This is isolated tool selection, not an OS sandbox. In particular, a prompt that says a child must not edit is not an OS enforcement boundary. `web_fetch` also automatically saves fetched material as shared artifacts, so an investigate child is not a zero-write OS sandbox even though it has no file-writing tool.

Children do not inherit the parent's context files, skills, prompt templates, or extensions. The briefing must therefore include the relevant project context. The parent owns the project's `CONTEXT.md`; children report context updates and do not edit that file or any other shared file concurrently unless the task explicitly assigns that edit.

## Profiles

The profile is part of the task contract. Do not give a child a broader tool list for convenience.

| Profile | Model | Tools | Use |
|---|---|---|---|
| `investigate` | `openai-codex/gpt-5.6-luna` | `read`, `grep`, `find`, `ls`, `web_fetch` | Routine evidence-based source or web investigation. Return a compact report with evidence and citations. It has no `bash`, `write`, or `edit`. |
| `specialist` | `openai-codex/gpt-5.6-terra` | `read`, `grep`, `find`, `ls` | An explicitly user-requested named role for advisory brainstorming, design, workflow, or implementation critique. Give concrete concerns, remedies, and tradeoffs. It is not an automatic persona. |
| `implement` | `openai-codex/gpt-5.6-terra` | `read`, `write`, `edit`, `bash` | Implement a fully specified task and perform cheap verification where appropriate. |
| `verify` | `openai-codex/gpt-5.6-luna` | `bash` | Run the exact verification command named in the task and report evidence. Its no-edit behavior is a prompt rule, not OS enforcement. |
| `review` | `openai-codex/gpt-5.6-terra` | `read`, `grep` | Independent code review for correctness, simplicity, and maintainability. Report concrete simpler alternatives when they preserve behavior. |

`web_fetch` is an installed extension, not a package-install path, and using it requires no package or global settings change. It fetches specified sources, not arbitrary web search, and it is not a JavaScript browser. Children intentionally have no MCP or browser tools because isolated extension selection excludes them. Pi does support MCP in general; this child workflow does not provide it.

## Workflow

The parent frames the problem, reasons about the solution, and integrates the results. Delegate routine investigation and mechanical work when doing so preserves the parent's context. A bounded, clear implementation can go to `implement`; keep complex integration in the parent when the child would need broad architectural context.

Run an independent fresh `review` child near the end regardless of who authored the change. There is no hard runtime gate that blocks completion when review is unavailable. Evaluate review findings against the task and code rather than applying them blindly. If review could not run, disclose that limitation.

A child briefing should include:

- absolute paths and the relevant `CONTEXT.md` handoff
- the exact task boundary and success criteria
- files the child may change, if any
- required verification commands and reporting format

The parent updates project `CONTEXT.md` at the start and end of work. Children report information for that handoff and do not silently maintain a competing context file. No child may dispatch another child.

## Model routing

Use the cheapest model that fits the judgment required:

| Tier | Model | Use |
|---|---|---|
| Bounded | `openai-codex/gpt-5.6-luna` | Investigation, verification, and small scoped review |
| Standard | `openai-codex/gpt-5.6-terra` | Normal implementation, synthesis, and review |
| Hard judgment | `openai-codex/gpt-5.6-sol` | Architecture, difficult judgment, and deep final review |

Do not route every review to the strongest model automatically. The explicit `opencode-go/deepseek-v4-flash` override remains approved for suitable dispatches. Codex is the default route. Do not use stale Copilot or unsupported OpenCode model defaults. Known approved Codex routes are `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.6-terra`, and `openai-codex/gpt-5.6-luna`; the approved OpenCode Go override is `opencode-go/deepseek-v4-flash`.

## Browser and web evidence

Prefer `web_fetch` for a named source when the task calls for source or web evidence. Fetched results are saved to the shared artifact root, so reports can cite the artifact without writing into the project.

When a browser is genuinely needed, keep the existing standalone Node script pattern: the parent writes the script with assertions, selectors, login steps, and a pinned path to an already installed browser, then a child with the required `bash` tool runs it and reports the output. Use installed or already cached Playwright tooling only. Do not use `npx` to fetch or install tooling, do not run `npm install`, and do not download a second browser without explicit approval.

Prefer `waitUntil: 'domcontentloaded'` and `waitForSelector(..., { state: 'attached' })` for pages that live-poll. Clear single-session state before login when the application can answer "Already Signed In". Do not drive the browser with the unstable `playwright-cli`; use the standalone script instead.

The browser script is a fallback for browser-specific work, not a way to give children a browser or MCP. The profile's explicit tool list still controls what the child receives.

## Timeouts

The default child timeout is 10 minutes. Set `timeoutSeconds` only for a known, bounded command, from 60 through 1,800 seconds. A timeout is a capacity signal, not a model-quality signal, so do not retry the same task on a stronger model only because the child timed out.

## Dispatch forms

Single task:

```
{ agent, task, model?, timeoutSeconds? }
```

Parallel tasks use a fixed worker pool with a maximum concurrency of four:

```
{ tasks: [{ agent, task, model?, timeoutSeconds? }, ...] }
```

## Model availability

Probe a model before wiring it into a config. Authentication can look configured while the provider is unavailable, credits are exhausted, or a model is plan-restricted:

```
pi -p --no-session --no-tools --model <provider/model> "Reply with exactly: ok"
```

A dead model usually fails at dispatch time with a provider error rather than at config load time. Keep model probes and dispatches within the approved routes above.
