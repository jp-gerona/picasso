# repo-review: rakyll/hey

Scanned at 2026-08-14T07:05:32.354Z, HEAD `5626f79b8698df6daf9b25799c9805c6acc96740`, shallow clone, read-only.
Files scanned: 17. This file is self-contained; no tool access needed to read it.

## Verdict

**Low risk for adoption as a load-testing CLI.** Tiny Go codebase (17 files), no
install hooks, no shell scripts, no pipe-to-shell anywhere. The single telemetry
keyword hit is Apache-2.0 license boilerplate, not code. Credential-pattern hits are
all the tool's own documented `-a user:password` basic-auth flag and its test - a
load tester sending auth headers to the target you point it at is expected behavior,
not credential harvesting. Outbound URLs are docs links plus three
`storage.googleapis.com/hey-releases/...` prebuilt binaries in the README; per the
checklist's release-pipeline row, those binaries are not proven built from this
source - prefer `go install github.com/rakyll/hey@latest` (builds from source) over
downloading them. Dependencies are pinned via `go.mod`/`go.sum`. Caveats: the repo
is effectively unmaintained (CI on travis + an old workflow), so expect no security
fixes; and it is a load generator - point it only at systems you own.

## Repo structure (top level)

- `.github`
- `.gitignore`
- `.travis.yml`
- `Dockerfile`
- `LICENSE`
- `Makefile`
- `README.md`
- `go.mod`
- `go.sum`
- `hey.go`
- `hey_test.go`
- `requester`

## Dependency manifests

- `go.mod`
- `go.sum`

## Shell/install scripts present

Nothing found.

## Install-hook / pipe-to-shell patterns

Nothing found.

## Telemetry/analytics keyword matches

- `LICENSE:57: and issue tracking systems that are managed by, or on behalf of, the`

## Credential / env-var access patterns

- `Dockerfile:8: --disabled-password \`
- `README.md:50: -a  Basic authentication, username:password.`
- `README.md:93: -H "Authorization: Bearer token" \`
- `hey.go:92: -a  Basic authentication, username:password.`
- `hey.go:164: var username, password string`
- `hey.go:170: username, password = match[1], match[2]`
- `hey.go:199: if username != "" || password != "" {`
- `hey.go:200: req.SetBasicAuth(username, password)`
- `requester/requester_test.go:91: req.SetBasicAuth("username", "password")`

## Outbound URLs referenced in source (tests excluded, 12 unique)

- http://i.imgur.com/szzD9q0.png (README.md)
- http://www.apache.org/licenses/ (LICENSE)
- http://www.apache.org/licenses/LICENSE-2.0 (LICENSE)
- https://brew.sh/ (README.md)
- https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-go (.github/workflows/go.yml)
- https://github.com/${PACKAGE (Dockerfile)
- https://github.com/tarekziade/boom (README.md)
- https://google.com (README.md)
- https://stackoverflow.com/a/55757473/12429735 (Dockerfile)
- https://storage.googleapis.com/hey-releases/hey_darwin_amd64 (README.md)
- https://storage.googleapis.com/hey-releases/hey_linux_amd64 (README.md)
- https://storage.googleapis.com/hey-releases/hey_windows_amd64 (README.md)

