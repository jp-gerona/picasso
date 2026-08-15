/**
 * thinking - quick thinking-level selection.
 *
 *   /thinking              -> pick a level from a selector
 *   /thinking <level>      -> set the level directly (off, minimal, low, medium, high, xhigh, max)
 *
 * Persists to settings exactly like the /settings menu: pi.setThinkingLevel()
 * routes through the session, which clamps to the current model's capabilities
 * and saves when the level actually changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** All thinking levels pi knows about, in display order. */
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** Levels offered when no model is selected yet (mirrors the session's default list). */
const BASE_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high"] as const;

/** Human-readable descriptions, matching pi's built-in thinking selector. */
const LEVEL_DESCRIPTIONS: Record<string, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Extra-high reasoning (~32k tokens)",
	max: "Maximum reasoning",
};

/**
 * Thinking levels the given model actually supports.
 * Mirrors pi-ai's getSupportedThinkingLevels: non-reasoning models only get
 * "off", and "xhigh"/"max" require an explicit entry in the model's
 * thinkingLevelMap. Falls back to the base list when no model is selected.
 */
export function getSupportedLevels(
	model:
		| {
				reasoning?: boolean;
				thinkingLevelMap?: Partial<Record<string, string | null>>;
		  }
		| undefined,
): string[] {
	if (!model) return [...BASE_THINKING_LEVELS];
	if (!model.reasoning) return ["off"];
	return THINKING_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh" || level === "max") return mapped !== undefined;
		return true;
	});
}

export default function thinkingExtension(pi: ExtensionAPI) {
	pi.registerCommand("thinking", {
		description: "Set thinking level for the current model",
		argumentHint: "<level>",
		getArgumentCompletions: (prefix) => {
			const levels = THINKING_LEVELS.filter((level) => level.startsWith(prefix.toLowerCase()));
			if (levels.length === 0) return null;
			return levels.map((level) => ({
				value: level,
				label: level,
				description: LEVEL_DESCRIPTIONS[level],
			}));
		},
		handler: async (args, ctx) => {
			const levelArg = args.trim().toLowerCase();
			const supported = getSupportedLevels(ctx.model);

			if (levelArg === "") {
				// No argument: pick from a selector when UI is available.
				if (!ctx.hasUI) {
					const current = ctx.thinkingLevel ?? pi.getThinkingLevel();
					ctx.ui.notify(`Thinking level: ${current}. Usage: /thinking <${supported.join("|")}>`, "info");
					return;
				}
				const options = supported.map((level) => `${level} - ${LEVEL_DESCRIPTIONS[level]}`);
				const selected = await ctx.ui.select("Thinking Level", options);
				if (!selected) return; // cancelled
				const level = supported.find((candidate) => selected.startsWith(`${candidate} - `));
				if (!level) return;
				pi.setThinkingLevel(level);
				ctx.ui.notify(`Thinking level: ${level}`, "info");
				return;
			}

			if (!supported.includes(levelArg)) {
				if (ctx.model && !ctx.model.reasoning && levelArg !== "off") {
					ctx.ui.notify("Current model does not support thinking", "warning");
				} else {
					ctx.ui.notify(`Invalid thinking level '${levelArg}'. Valid levels: ${supported.join(", ")}`, "warning");
				}
				return;
			}

			pi.setThinkingLevel(levelArg);
			ctx.ui.notify(`Thinking level: ${levelArg}`, "info");
		},
	});
}
