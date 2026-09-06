import type { ProviderUsage, UsageProvider } from "./data.ts";
import type { SessionUsage } from "./session-stats.ts";

export type UsagePanelResult = {
	provider?: UsageProvider;
	usage?: ProviderUsage;
	error?: string;
	session: SessionUsage;
};

export type UsagePanelColor = "yellow" | "teal" | "red" | "muted" | "border";

export type UsagePanelSegment = {
	text: string;
	color?: UsagePanelColor;
};

export type UsagePanelLine = {
	text?: string;
	segments?: UsagePanelSegment[];
	color?: UsagePanelColor;
};

export function renderUsagePanelLine(
	line: UsagePanelLine,
	style: (text: string, color: UsagePanelColor | undefined) => string,
): string {
	if (line.segments) {
		return line.segments.map((segment) => style(segment.text, segment.color ?? line.color)).join("");
	}
	return style(line.text ?? "", line.color);
}

export function buildUsagePanelLines(results: UsagePanelResult[], now = Date.now(), width = 32): UsagePanelLine[] {
	const lines: UsagePanelLine[] = [
		{ text: divider(width), color: "border" },
		{ text: "" },
		{ text: "Usage limits", color: "yellow" },
		{ text: "" },
	];
	for (const result of results) {
		const name = result.usage?.name ?? providerName(result.provider);
		if (!name) {
			continue;
		}
		if (lines.length > 4) {
			lines.push({ text: "" });
		}
		lines.push({ text: result.usage?.plan ? `${name} - ${result.usage.plan}` : name, color: "teal" });
		if (result.error) {
			lines.push({ text: `Error: ${result.error}`, color: "red" });
		} else if (result.usage) {
			lines.push({ text: formatSession(result.session) });
			for (const window of result.usage.windows) {
				const segments = usageBar(window.label, window.percent, window.resetsAt, now);
				lines.push(window.limited ? { segments, color: "red" } : { segments });
			}
		}
	}
	lines.push({ text: "" }, { text: "Esc closes - rerun /usage to refresh", color: "muted" }, { text: divider(width), color: "border" });
	return lines;
}

function providerName(provider: UsageProvider | undefined): string | undefined {
	if (provider === "openai-codex") {
		return "OpenAI Codex";
	}
	if (provider === "opencode-go") {
		return "OpenCode Go";
	}
	return undefined;
}

function usageBar(label: string, percent: number, resetsAt: string, now: number): UsagePanelSegment[] {
	const width = 18;
	const used = Math.round((percent / 100) * width);
	const segments: UsagePanelSegment[] = [{ text: label.padEnd(10) }];
	if (used > 0) {
		segments.push({ text: "█".repeat(used) });
	}
	if (used < width) {
		segments.push({ text: "░".repeat(width - used), color: "muted" });
	}
	segments.push({ text: `  ${percent}%  resets in ${formatRemaining(resetsAt, now)} - ${formatPht(resetsAt)}` });
	return segments;
}

function formatSession(usage: SessionUsage): string {
	return `Session: ${usage.requests} request${usage.requests === 1 ? "" : "s"} - in ${formatNumber(usage.input)} - out ${formatNumber(usage.output)} - cache ${formatNumber(usage.cacheRead)}`;
}

function formatNumber(value: number): string {
	if (value < 1_000) {
		return `${value}`;
	}
	return `${(value / 1_000).toFixed(value < 100_000 ? 1 : 0)}k`;
}

function formatRemaining(resetsAt: string, now: number): string {
	let seconds = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 1_000));
	if (seconds === 0) {
		return "now";
	}
	const units: Array<[number, string]> = [
		[86_400, "d"],
		[3_600, "h"],
		[60, "m"],
	];
	const parts: string[] = [];
	for (const [size, suffix] of units) {
		const amount = Math.floor(seconds / size);
		seconds %= size;
		if (amount > 0) {
			parts.push(`${amount}${suffix}`);
		}
	}
	return parts.join(" ") || "<1m";
}

function formatPht(resetsAt: string): string {
	const date = new Date(resetsAt);
	const value = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
	return `${value} PHT`;
}

function divider(width: number): string {
	return "─".repeat(Math.max(1, width));
}
