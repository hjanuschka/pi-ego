import fs from "node:fs";
import { spawn } from "node:child_process";
import { Container, Image, Text, matchesKey } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { EgoStore } from "./store.ts";
import type { Shot } from "./types.ts";

interface GalleryTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

function openInViewer(file: string): void {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		spawn(cmd, [file], { detached: true, stdio: "ignore" }).unref();
	} catch {
		/* ignore viewer failures */
	}
}

function rel(ts: number): string {
	const s = Math.round((Date.now() - ts) / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	return `${Math.round(m / 60)}h ago`;
}

/**
 * Filmstrip overlay over the session's screenshots. Renders the current shot
 * inline (in image-capable terminals) with its URL/title/time, plus a strip of
 * thumbnails as a position indicator. Arrow keys browse; 'o' opens the PNG in
 * the system viewer; 'e' triggers export; Esc/q closes.
 */
export class GalleryComponent extends Container {
	private idx = 0;
	private image?: Image;
	private readonly shots: Shot[];

	constructor(
		store: EgoStore,
		private theme: GalleryTheme,
		private onClose: () => void,
		private onExport: () => void,
	) {
		super();
		this.shots = [...store.shots].reverse(); // newest first
		this.rebuild();
	}

	private current(): Shot | undefined {
		return this.shots[this.idx];
	}

	private rebuild(): void {
		this.clear();
		const t = this.theme;
		const shot = this.current();

		if (!shot) {
			this.addChild(
				new Text(t.fg("warning", "No screenshots captured in this session yet."), 1, 1),
			);
			this.addChild(new Text(t.fg("dim", "Take one with ego_screenshot or captureScreenshot()."), 1, 0));
			this.addChild(new Text(t.fg("dim", "Esc / q  close"), 1, 1));
			return;
		}

		// Header
		this.addChild(
			new Text(
				t.bold(t.fg("accent", `📸 ego gallery  ${this.idx + 1}/${this.shots.length}`)),
				1,
				0,
			),
		);

		// Inline image (best-effort; degrades to fallback text in plain terminals)
		try {
			const data = fs.readFileSync(shot.file).toString("base64");
			this.image = new Image(
				data,
				"image/png",
				{ fallbackColor: (s) => t.fg("dim", s) },
				{ maxWidthCells: 100, maxHeightCells: 22, filename: shot.file },
			);
			this.addChild(this.image);
		} catch {
			this.addChild(new Text(t.fg("error", `(could not read ${shot.file})`), 1, 0));
		}

		// Metadata
		if (shot.title) this.addChild(new Text(t.bold(shot.title), 1, 0));
		if (shot.url) this.addChild(new Text(t.fg("accent", shot.url), 1, 0));
		const meta: string[] = [rel(shot.ts), `#${shot.id}`];
		if (shot.taskSpace) meta.push(`space:${shot.taskSpace}`);
		this.addChild(new Text(t.fg("muted", meta.join("  •  ")), 1, 0));

		// Thumbnail strip as a position indicator
		const strip = this.shots
			.map((_, i) => (i === this.idx ? t.fg("accent", "▣") : t.fg("dim", "▢")))
			.join("");
		this.addChild(new Text(strip, 1, 0));

		// Footer help
		this.addChild(
			new Text(
				t.fg("dim", "←/→ or h/l browse   o open file   e export html   Esc/q close"),
				1,
				0,
			),
		);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q") {
			this.onClose();
			return;
		}
		if (matchesKey(data, "left") || data === "h" || data === "k") {
			if (this.idx > 0) this.idx--;
			this.rebuild();
			this.invalidate();
			return;
		}
		if (matchesKey(data, "right") || data === "l" || data === "j") {
			if (this.idx < this.shots.length - 1) this.idx++;
			this.rebuild();
			this.invalidate();
			return;
		}
		if (data === "g") {
			this.idx = 0;
			this.rebuild();
			this.invalidate();
			return;
		}
		if (data === "G") {
			this.idx = Math.max(0, this.shots.length - 1);
			this.rebuild();
			this.invalidate();
			return;
		}
		if (data === "o") {
			const shot = this.current();
			if (shot) openInViewer(shot.file);
			return;
		}
		if (data === "e") {
			this.onClose();
			this.onExport();
			return;
		}
	}
}
