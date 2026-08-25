/**
 * safePath - resolve a user-supplied path against cwd, allowing trusted
 * user directories (cwd, ~/Downloads, ~/Documents) and rejecting everything
 * else.
 *
 * Trusted roots exist so requests like "analyze ~/Downloads/report.xlsx" work
 * without the agent copying the file into the workspace first. Every other
 * absolute path or ../ traversal that escapes the trusted set is rejected,
 * which keeps the guard meaningful against path-injection into arbitrary
 * locations on disk.
 *
 * Boundary check uses path.relative so that a sibling like ~/Documents-evil
 * (a prefix forgery) is not mistaken for ~/Documents.
 */

import os from "node:os";
import path from "node:path";

function isUnder(candidate: string, root: string): boolean {
	if (candidate === root) return true;
	const rel = path.relative(root, candidate);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function safePath(cwd: string, raw: string): string {
	const base = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
	const home = os.homedir();
	const trusted = [cwd, path.join(home, "Downloads"), path.join(home, "Documents")];
	for (const root of trusted) {
		if (isUnder(base, root)) return base;
	}
	throw new Error(`Path escapes cwd: ${raw}`);
}
