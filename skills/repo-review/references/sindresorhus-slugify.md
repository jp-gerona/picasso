# repo-review: sindresorhus/slugify

Scanned at 2026-08-14T07:14:03.078Z, HEAD `7c318bd1aa4b4affab29761f15a9604323fe2a3b`, shallow clone, read-only.
Files scanned: 13. This file is self-contained; no tool access needed to read it.

## Verdict

**Low risk for adoption.** 13-file pure-function JS library (string in, slug out):
no install hooks, no shell scripts, no telemetry keywords, no credential or env-var
access at all. All 9 outbound URLs are docs, sponsor, and security-policy links in
readme/license/metadata - none in runtime code. Single manifest (`package.json`);
the one thing the scan cannot show is its runtime dependency `@sindresorhus/transliterate`,
which inherits this repo's trust question one level down - review it separately
before high-trust use. Actively maintained, widely used, no lockfile in-repo
(normal for a published library).

## Repo structure (top level)

- `.editorconfig`
- `.gitattributes`
- `.github`
- `.gitignore`
- `.npmrc`
- `index.d.ts`
- `index.js`
- `license`
- `overridable-replacements.js`
- `package.json`
- `readme.md`
- `test.js`

## Dependency manifests

- `package.json`

## Shell/install scripts present

Nothing found.

## Install-hook / pipe-to-shell patterns

Nothing found.

## Telemetry/analytics keyword matches

Nothing found.

## Credential / env-var access patterns

Nothing found.

## Outbound URLs referenced in source (tests excluded, 9 unique)

- https://en.wikipedia.org/wiki/Germanic_umlaut (readme.md)
- https://github.com/sindresorhus/filenamify (readme.md)
- https://github.com/sindresorhus/slugify-cli (readme.md)
- https://github.com/sindresorhus/transliterate (readme.md)
- https://github.com/sindresorhus/transliterate#locale (index.d.ts)
- https://github.com/sindresorhus/transliterate#supported-languages (readme.md)
- https://github.com/sponsors/sindresorhus (package.json)
- https://sindresorhus.com (license)
- https://tidelift.com/security (.github/security.md)

