/**
 * output-dir - shared artifact output root for extensions and skills.
 *
 * Everything an extension produces for the user (analysis reports, fetched
 * pages, repo reviews) is written as a self-contained markdown file under a
 * single Finder-visible root, never inside the tracked config repo.
 *
 * Resolution order:
 *   1. PI_OUTPUT_DIR env var (absolute or cwd-relative)
 *   2. ~/Documents/pi  (when ~/Documents exists - the common case)
 *   3. ~/.pi/output    (fallback when there is no Documents folder)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Resolve the artifact root. Home and env are injectable for tests. */
export function resolveOutputRoot(
	home: string = os.homedir(),
	env: NodeJS.ProcessEnv = process.env,
): string {
	const override = env.PI_OUTPUT_DIR?.trim();
	if (override) return path.resolve(override);
	const docs = path.join(home, "Documents");
	if (existsSync(docs)) return path.join(docs, "pi");
	return path.join(home, ".pi", "output");
}

/**
 * Write an artifact under <root>/<subdir>/<baseName><ext>, creating
 * directories as needed. On a name collision the new file gets a timestamp
 * suffix instead of overwriting. Returns the absolute path written.
 */
export function saveArtifact(
	root: string,
	subdir: string,
	baseName: string,
	content: string,
	ext = ".md",
): string {
	const dir = path.join(root, subdir);
	mkdirSync(dir, { recursive: true });
	let file = path.join(dir, `${baseName}${ext}`);
	if (existsSync(file)) {
		const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
		file = path.join(dir, `${baseName}-${stamp}${ext}`);
	}
	writeFileSync(file, content);
	return file;
}

/** Reduce arbitrary text (a page title, a workbook name) to a filename-safe slug. */
export function slugify(text: string, maxLen = 60): string {
	const slug = text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, maxLen)
		.replace(/-+$/g, "");
	return slug || "artifact";
}

/** Today as YYYY-MM-DD, used to date-stamp artifact filenames. */
export function today(): string {
	return new Date().toISOString().slice(0, 10);
}
