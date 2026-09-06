import { CustomEditor, readStoredCredential, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { registerUsageCommand } from "./command.ts";
import type { UsagePanelColor, UsagePanelResult } from "./panel.ts";
import { buildUsagePanelLines, renderUsagePanelLine } from "./panel.ts";

type DisplayTheme = {
	fg(color: "accent" | "border" | "error" | "muted" | "warning", text: string): string;
};

type PanelUi = {
	getEditorComponent(): unknown;
	setEditorComponent(factory: unknown): void;
	theme: DisplayTheme;
};

export default function usageLimits(pi: ExtensionAPI) {
	registerUsageCommand(pi, (ui, results) => showUsagePanel(ui as unknown as PanelUi, results), {
		hasCredential: (provider) => readStoredCredential(provider) !== undefined,
	});
}

function showUsagePanel(ui: PanelUi, results: UsagePanelResult[]) {
	const previous = ui.getEditorComponent();
	let open = true;
	const close = () => {
		if (!open) {
			return;
		}
		open = false;
		ui.setEditorComponent(previous);
	};
	ui.setEditorComponent((tui, theme, keybindings) => new UsageEditor(tui, theme, keybindings, ui.theme, results, close));
}

class UsageEditor extends CustomEditor {
	private readonly panelTui: { requestRender(): void };
	private readonly displayTheme: DisplayTheme;
	private readonly results: UsagePanelResult[];
	private readonly close: () => void;

	constructor(
		tui: any,
		theme: any,
		keybindings: any,
		displayTheme: DisplayTheme,
		results: UsagePanelResult[],
		close: () => void,
	) {
		super(tui, theme, keybindings);
		this.panelTui = tui;
		this.displayTheme = displayTheme;
		this.results = results;
		this.close = close;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.close();
			this.panelTui.requestRender();
		}
	}

	render(width: number): string[] {
		return buildUsagePanelLines(this.results, Date.now(), width).map((line) =>
			truncateToWidth(renderUsagePanelLine(line, (text, color) => this.styleText(text, color)), width),
		);
	}

	private styleText(text: string, color: UsagePanelColor | undefined): string {
		if (color === "yellow") {
			return this.displayTheme.fg("warning", text);
		}
		if (color === "teal") {
			return this.displayTheme.fg("accent", text);
		}
		if (color === "red") {
			return this.displayTheme.fg("error", text);
		}
		if (color === "muted") {
			return this.displayTheme.fg("muted", text);
		}
		if (color === "border") {
			return this.displayTheme.fg("border", text);
		}
		return text;
	}
}
