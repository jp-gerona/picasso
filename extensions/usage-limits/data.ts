export type UsageProvider = "openai-codex" | "opencode-go";

export type UsageWindow = {
	label: string;
	percent: number;
	resetsAt: string;
	limited: boolean;
};

export type ProviderUsage = {
	provider: UsageProvider;
	name: string;
	plan?: string;
	windows: UsageWindow[];
};

type JsonObject = Record<string, unknown>;

export function parseOpenAiCodexUsage(raw: unknown): ProviderUsage {
	const response = asObject(raw);
	const rateLimit = objectAt(response, "rate_limit");
	const allowed = rateLimit.allowed;
	const limitReached = rateLimit.limit_reached;
	if (typeof allowed !== "boolean" || typeof limitReached !== "boolean") {
		throw new Error("Invalid Codex usage response");
	}
	const windows = [
		parseCodexWindow(rateLimit.primary_window, !allowed || limitReached),
		parseCodexWindow(rateLimit.secondary_window, !allowed || limitReached),
	].filter((window): window is UsageWindow => window !== undefined);
	if (windows.length === 0) {
		throw new Error("Codex usage response has no quota windows");
	}
	return {
		provider: "openai-codex",
		name: "OpenAI Codex",
		plan: formatPlan(response.plan_type),
		windows,
	};
}

export function parseOpenCodeGoUsage(raw: unknown): ProviderUsage {
	const usage = objectAt(raw, "usage");
	return {
		provider: "opencode-go",
		name: "OpenCode Go",
		windows: [
			parseOpenCodeWindow("Rolling", usage.rolling),
			parseOpenCodeWindow("Weekly", usage.weekly),
			parseOpenCodeWindow("Monthly", usage.monthly),
		],
	};
}

function parseCodexWindow(raw: unknown, limited: boolean): UsageWindow | undefined {
	if (raw === null || raw === undefined) {
		return undefined;
	}
	const window = asObject(raw);
	const percent = window.used_percent;
	const seconds = window.limit_window_seconds;
	const resetAt = window.reset_at;
	if (
		typeof percent !== "number" ||
		!Number.isFinite(percent) ||
		percent < 0 ||
		percent > 100 ||
		typeof seconds !== "number" ||
		!Number.isFinite(seconds) ||
		seconds <= 0 ||
		typeof resetAt !== "number" ||
		!Number.isFinite(resetAt)
	) {
		throw new Error("Invalid Codex quota window");
	}
	return {
		label: formatWindowDuration(seconds),
		percent,
		resetsAt: new Date(resetAt * 1000).toISOString(),
		limited,
	};
}

function formatPlan(raw: unknown): string | undefined {
	if (typeof raw !== "string" || raw.length === 0 || raw === "unknown") {
		return undefined;
	}
	return raw
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function formatWindowDuration(seconds: number): string {
	const units: Array<[number, string]> = [
		[86_400, "day"],
		[3_600, "hour"],
		[60, "minute"],
	];
	for (const [size, label] of units) {
		if (seconds >= size && seconds % size === 0) {
			const amount = seconds / size;
			return `${amount} ${label}${amount === 1 ? "" : "s"}`;
		}
	}
	return `${seconds} seconds`;
}

function parseOpenCodeWindow(label: string, raw: unknown): UsageWindow {
	const window = asObject(raw);
	const percent = window.percent;
	const resetsAt = window.resetsAt;
	if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
		throw new Error(`Invalid ${label.toLowerCase()} usage percentage`);
	}
	if (typeof resetsAt !== "string" || Number.isNaN(Date.parse(resetsAt))) {
		throw new Error(`Invalid ${label.toLowerCase()} reset time`);
	}
	if (window.status !== "ok" && window.status !== "rate-limited") {
		throw new Error(`Invalid ${label.toLowerCase()} usage status`);
	}
	return { label, percent, resetsAt, limited: window.status === "rate-limited" };
}

function objectAt(raw: unknown, key: string): JsonObject {
	return asObject(asObject(raw)[key]);
}

function asObject(raw: unknown): JsonObject {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Invalid usage response");
	}
	return raw as JsonObject;
}
