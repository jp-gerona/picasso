# Review-mode checklist

What the scanner gathers and what the reviewer weighs when writing the verdict.
Seed example throughout: no-mistakes, a Go CLI, ships default-on telemetry with
opt-out via an env var, wired into official release binaries at build time - invisible
in a casual source skim because the wiring lives in release/build config, not in the
feature code. That is the kind of finding this checklist exists to catch.

| Check | What to look at | Why it matters (reasoning) |
|---|---|---|
| Repo structure | Top-level dirs/files | Orients the rest of the review; a `telemetry/` or `installer/` dir is a flag to read first. |
| Install hooks | `preinstall`/`postinstall`/`prepare` in package.json, setup.py, Makefile targets | These execute on the adopter's machine at install time - the single most common vector for running untrusted code. |
| Pipe-to-shell | `curl ... \| sh` in READMEs/scripts | The documented install path executes remote content sight unseen; check what the script actually does before recommending it. |
| Telemetry/analytics | Keyword hits AND build/release config | Default-on vs opt-in, and where it is wired. no-mistakes wires default-on telemetry into official release binaries at build time with only an env-var opt-out - source skims miss it because the build flags, not the code, enable it. Always check goreleaser/CI/build files, not just feature code. |
| Outbound URLs | Every URL in source, tests excluded | Enumerates who the tool can talk to. Unexplained non-vendor endpoints in runtime code paths need reading before trust. |
| Credential/env access | `os.Getenv`, `process.env`, `~/.aws`, `~/.ssh`, keychain | A tool that reads credentials plus has outbound endpoints is an exfiltration shape; either alone may be benign. |
| Dependency manifests | Which ecosystems, how many deps, lockfiles present | Each dependency tree is a supply chain you inherit; unlocked manifests mean unreviewable drift. |
| Release pipeline | CI configs, goreleaser, build flags | Official binaries can differ from a source build (see no-mistakes row above); trust in "I read the source" only extends to binaries proven built from it. |
