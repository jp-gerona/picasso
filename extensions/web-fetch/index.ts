/**
 * web-fetch - a deterministic Pi tool that fetches a URL and extracts
 * readable content as clean markdown.
 *
 * Design principle: every transformation is local and reproducible. The
 * same response bytes always produce the same output. There is no
 * third-party reader proxy fallback (such as Jina Reader): a page that
 * cannot be extracted locally returns a clear error instead of silently
 * rewriting content through an external service whose behavior can
 * change between calls.
 *
 * Pipeline:
 *   validate URL
 *   fetch with a browser-like User-Agent, timeout, and abort support
 *   PDF?        -> unpdf text extraction
 *   HTML?       -> linkedom parse + Readability + turndown -> markdown
 *   other text? -> passthrough
 *   binary?     -> unsupported content type error
 *
 * PDFs are capped at MAX_PDF_PAGES pages and MAX_PDF_SIZE bytes. HTML
 * responses are capped at MAX_RESPONSE_SIZE bytes. Pages whose extracted
 * markdown is below MIN_USEFUL_CONTENT chars are reported as incomplete
 * rather than returned as if they were full articles.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

// ── Constants ────────────────────────────────────────────────────────

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MIN_USEFUL_CONTENT = 500;

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
});

// ── Types ────────────────────────────────────────────────────────────

interface FetchResult {
	url: string;
	title: string;
	content: string;
	error: string | null;
}

// ── URL validation ───────────────────────────────────────────────────

function safeUrl(raw: string): URL | null {
	try {
		const url = new URL(raw);
		// Only fetch http(s). Other schemes (file, javascript, data)
		// are refused so the tool never reads local resources.
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url;
	} catch {
		return null;
	}
}

// ── PDF extraction ───────────────────────────────────────────────────

function isPdf(url: string, contentType?: string): boolean {
	if (contentType?.includes("application/pdf")) return true;
	try {
		return new URL(url).pathname.toLowerCase().endsWith(".pdf");
	} catch {
		return false;
	}
}

async function extractPdf(
	buffer: ArrayBuffer,
	url: string,
): Promise<FetchResult> {
	const { getDocumentProxy } = await import("unpdf");
	const pdf = await getDocumentProxy(new Uint8Array(buffer));

	const metadata = await pdf.getMetadata();
	const info =
		metadata.info && typeof metadata.info === "object"
			? (metadata.info as Record<string, unknown>)
			: null;
	const metaTitle =
		typeof info?.Title === "string" ? info.Title.trim() : "";
	const metaAuthor =
		typeof info?.Author === "string" ? info.Author.trim() : "";

	let urlTitle = "document";
	try {
		const pathname = new URL(url).pathname;
		const base = pathname.split("/").pop() ?? pathname;
		urlTitle = base.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "document";
	} catch {
		/* keep default */
	}
	const title = metaTitle || urlTitle;

	const maxPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
	const pages: string[] = [];
	for (let i = 1; i <= maxPages; i++) {
		const page = await pdf.getPage(i);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item: unknown) => (item as { str?: string }).str ?? "")
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (pageText) pages.push(pageText);
	}

	const lines: string[] = [
		`# ${title}`,
		"",
		`> Source: ${url}`,
		`> Pages: ${pdf.numPages}${pdf.numPages > maxPages ? ` (extracted first ${maxPages})` : ""}`,
	];
	if (metaAuthor) lines.push(`> Author: ${metaAuthor}`);
	lines.push("", "---", "", pages.join("\n\n"));

	if (pdf.numPages > maxPages) {
		lines.push("", "---", "", `*[Truncated: first ${maxPages} of ${pdf.numPages} pages]*`);
	}

	return { url, title, content: lines.join("\n"), error: null };
}

// ── HTML extraction ──────────────────────────────────────────────────

function headingTitle(text: string): string | null {
	const match = text.match(/^#{1,2}\s+(.+)/m);
	if (!match) return null;
	const cleaned = match[1].replace(/\*+/g, "").trim();
	return cleaned || null;
}

function looksJsRendered(html: string): boolean {
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	if (!bodyMatch) return false;
	const textContent = bodyMatch[1]
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const scriptCount = (html.match(/<script/gi) ?? []).length;
	return textContent.length < 500 && scriptCount > 3;
}

function extractHtml(html: string, url: string): FetchResult {
	const { document } = parseHTML(html);
	const reader = new Readability(document as unknown as Document);
	const article = reader.parse();

	if (!article) {
		const jsRendered = looksJsRendered(html);
		return {
			url,
			title: "",
			content: "",
			error: jsRendered
				? "Page appears to be JavaScript-rendered (content loads dynamically). web-fetch does not execute scripts."
				: "Could not extract readable content from the HTML structure.",
		};
	}

	const markdown = turndown.turndown(article.content);

	if (markdown.length < MIN_USEFUL_CONTENT) {
		return {
			url,
			title: article.title || "",
			content: markdown,
			error: looksJsRendered(html)
				? "Page appears to be JavaScript-rendered (content loads dynamically). web-fetch does not execute scripts."
				: "Extracted content appears incomplete.",
		};
	}

	return {
		url,
		title: article.title || "",
		content: markdown,
		error: null,
	};
}

// ── Fetch + extract ──────────────────────────────────────────────────

function unsupportedContentType(contentType: string): string {
	return `Unsupported content type: ${contentType.split(";")[0]}`;
}

async function fetchAndExtract(
	url: string,
	signal?: AbortSignal,
): Promise<FetchResult> {
	if (signal?.aborted) {
		return { url, title: "", content: "", error: "Aborted" };
	}

	const parsed = safeUrl(url);
	if (!parsed) {
		return { url, title: "", content: "", error: "Invalid or non-http(s) URL" };
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort);

	try {
		const response = await fetch(parsed, {
			signal: controller.signal,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache",
				"Sec-Fetch-Dest": "document",
				"Sec-Fetch-Mode": "navigate",
				"Sec-Fetch-Site": "none",
				"Sec-Fetch-User": "?1",
				"Upgrade-Insecure-Requests": "1",
			},
		});

		if (!response.ok) {
			return {
				url,
				title: "",
				content: "",
				error: `HTTP ${response.status}: ${response.statusText}`,
			};
		}

		const contentType = response.headers.get("content-type") ?? "";
		const isPdfContent = isPdf(url, contentType);
		const maxSize = isPdfContent ? MAX_PDF_SIZE : MAX_RESPONSE_SIZE;

		const contentLengthHeader = response.headers.get("content-length");
		if (contentLengthHeader) {
			const contentLength = parseInt(contentLengthHeader, 10);
			if (contentLength > maxSize) {
				return {
					url,
					title: "",
					content: "",
					error: `Response too large (${Math.round(contentLength / 1024 / 1024)}MB)`,
				};
			}
		}

		if (isPdfContent) {
			const buffer = await response.arrayBuffer();
			if (signal?.aborted) return { url, title: "", content: "", error: "Aborted" };
			return await extractPdf(buffer, url);
		}

		if (
			contentType.includes("application/octet-stream") ||
			contentType.includes("image/") ||
			contentType.includes("audio/") ||
			contentType.includes("video/") ||
			contentType.includes("application/zip")
		) {
			return { url, title: "", content: "", error: unsupportedContentType(contentType) };
		}

		const text = await response.text();
		if (signal?.aborted) return { url, title: "", content: "", error: "Aborted" };

		const isHtml =
			contentType.includes("text/html") ||
			contentType.includes("application/xhtml+xml");

		if (!isHtml) {
			// Plain text, JSON, XML, etc.: pass through verbatim.
			const title =
				headingTitle(text) ??
				parsed.pathname.split("/").pop() ??
				url;
			return { url, title, content: text, error: null };
		}

		return extractHtml(text, url);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (signal?.aborted) return { url, title: "", content: "", error: "Aborted" };
		return { url, title: "", content: "", error: message };
	} finally {
		clearTimeout(timeoutId);
		signal?.removeEventListener("abort", onAbort);
	}
}

// ── Extension registration ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch a URL and extract readable content as clean markdown. Handles HTML pages (Readability + Turndown) and PDFs (text extraction). Plain text passes through verbatim. No scripts are executed, so JavaScript-rendered pages return an error instead of partial content.",
		promptSnippet:
			"Fetch a URL and extract readable content as markdown. Supports HTML and PDF.",

		parameters: Type.Object({
			url: Type.String({ description: "http(s) URL to fetch" }),
		}),

		async execute(_toolCallId, params, signal) {
			const result = await fetchAndExtract(params.url, signal);

			if (result.error) {
				throw new Error(`${params.url}: ${result.error}`);
			}

			const header = result.title
				? `# ${result.title}\n\nSource: ${result.url}\n\n---\n\n`
				: `Source: ${result.url}\n\n---\n\n`;
			return {
				content: [{ type: "text" as const, text: header + result.content }],
				details: {
					url: result.url,
					title: result.title,
					chars: result.content.length,
				},
			};
		},

		renderCall(args, theme) {
			const { url } = args as { url?: string };
			if (!url) {
				return new Text(
					theme.fg("toolTitle", theme.bold("fetch ")) +
						theme.fg("error", "(no URL)"),
					0,
					0,
				);
			}
			const display = url.length > 70 ? url.slice(0, 67) + "..." : url;
			return new Text(
				theme.fg("toolTitle", theme.bold("fetch ")) +
					theme.fg("accent", display),
				0,
				0,
			);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Fetching..."), 0, 0);
			}

			if (!result) {
				return new Text(theme.fg("error", "Error"), 0, 0);
			}

			const firstText = result.content.find((c) => c.type === "text");
			// An errored tool result arrives as a thrown Error surfaced by
			// pi as a single text content block; surface it directly.
			const details = result.details as { title?: string; chars?: number } | undefined;
			if (!details) {
				const msg = firstText?.text ?? "Error";
				return new Text(theme.fg("error", msg), 0, 0);
			}

			const title = details.title || "Untitled";
			const chars = details.chars ?? 0;
			const status =
				theme.fg("success", title) +
				theme.fg("muted", ` (${chars} chars)`);

			if (!expanded) {
				return new Text(status, 0, 0);
			}

			const content = firstText?.text ?? "";
			const preview = content.length > 500 ? content.slice(0, 500) + "..." : content;
			return new Text(status + "\n" + theme.fg("dim", preview), 0, 0);
		},
	});
}
