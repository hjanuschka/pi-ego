import { Container, Text, matchesKey } from "@earendil-works/pi-tui";
import type { EgoStore } from "./store.ts";

interface SpacesTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

function rel(ts: number): string {
	const s = Math.round((Date.now() - ts) / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.round(m / 60)}h`;
}

function clip(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Read-only dashboard of every ego-lite task space seen this session: which are
 * still open, how many events each had, and the last URL touched. Surfaces the
 * parallel-Spaces work that is otherwise invisible behind opaque bash calls.
 */
export class SpacesComponent extends Container {
	constructor(
		store: EgoStore,
		private theme: SpacesTheme,
		private onClose: () => void,
	) {
		super();
		const t = theme;
		const spaces = store.spaceSummary();

		this.addChild(new Text(t.bold(t.fg("accent", "🗂  ego task spaces")), 1, 0));

		if (spaces.length === 0) {
			this.addChild(new Text(t.fg("muted", "No task spaces observed yet."), 1, 1));
		} else {
			const open = spaces.filter((s) => s.open).length;
			this.addChild(
				new Text(
					t.fg("muted", `${spaces.length} total  •  ${open} open  •  ${store.shots.length} shots`),
					1,
					0,
				),
			);
			this.addChild(new Text("", 1, 0));
			for (const s of spaces) {
				const dot = s.open ? t.fg("success", "●") : t.fg("dim", "○");
				const name = t.bold(clip(s.name, 28).padEnd(28));
				const evs = t.fg("muted", `${String(s.events).padStart(2)} ev`);
				const age = t.fg("dim", rel(s.lastTs).padStart(4));
				const url = s.lastUrl ? t.fg("accent", clip(s.lastUrl, 46)) : t.fg("dim", "-");
				this.addChild(new Text(`${dot} ${name} ${evs}  ${age}  ${url}`, 1, 0));
			}
		}

		// Recent navigation trail
		const navs = store.navs.slice(-6);
		if (navs.length) {
			this.addChild(new Text("", 1, 0));
			this.addChild(new Text(t.fg("dim", "recent navigation"), 1, 0));
			for (const n of navs) {
				this.addChild(
					new Text(`${t.fg("dim", rel(n.ts).padStart(4))}  ${t.fg("muted", clip(n.url, 60))}`, 1, 0),
				);
			}
		}

		this.addChild(new Text(t.fg("dim", "Esc / q  close"), 1, 1));
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q") this.onClose();
	}
}
