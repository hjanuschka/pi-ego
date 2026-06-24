import fs from "node:fs";
import { spawn } from "node:child_process";
import { Container, Image, Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EgoStore } from "./store.ts";
import {
	contentToText,
	extractNavTargets,
	extractPageInfos,
	extractScreenshotPaths,
	extractSpaceEvents,
	isEgoCommand,
} from "./parse.ts";
import { GalleryComponent } from "./gallery.ts";
import { SpacesComponent } from "./spaces.ts";
import { exportHtml } from "./export.ts";
import { domainsSeen, recordLearning } from "./learn.ts";
import { EGO_SPACE, registerEgoTools, runEgo } from "./tools.ts";
import type { Shot } from "./types.ts";

/**
 * pi-ego: a persistent browser-session layer on top of the ego-lite skill.
 * It indexes every screenshot, page, and task space the agent's browser touches
 * (whether driven by raw `ego-browser` heredocs or the ego_* tools), and exposes
 * a filmstrip gallery, a task-space dashboard, an HTML export, and a learnings
 * recorder.
 */

interface Settings {
	inline: boolean; // inline thumbnails in the transcript
	autocapture: boolean; // auto-screenshot after navigations with no shot
}

export default function (pi: ExtensionAPI) {
	let store: EgoStore | undefined;
	const settings: Settings = { inline: false, autocapture: false };

	pi.registerFlag("ego-inline", {
		description: "pi-ego: render captured screenshots inline in the transcript",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("ego-autocapture", {
		description: "pi-ego: auto-screenshot after ego navigations that produced no shot",
		type: "boolean",
		default: false,
	});

	registerEgoTools(pi);

	function refreshWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI || !store) return;
		const shots = store.shots.length;
		const open = store.spaceSummary().filter((s) => s.open).length;
		if (shots === 0 && open === 0) {
			ctx.ui.setWidget("pi-ego", undefined);
			return;
		}
		const t = ctx.ui.theme;
		ctx.ui.setWidget("pi-ego", [
			t.fg(
				"dim",
				`📸 ${shots} shot${shots === 1 ? "" : "s"}  ·  🗂 ${open} open space${open === 1 ? "" : "s"}  ·  /ego-gallery`,
			),
		]);
	}

	pi.on("session_start", (_event, ctx) => {
		settings.inline = Boolean(pi.getFlag?.("ego-inline"));
		settings.autocapture = Boolean(pi.getFlag?.("ego-autocapture"));
		store = new EgoStore(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		refreshWidget(ctx);
	});

	// Universal indexer: catch artifacts from bash heredocs and ego_* tools.
	pi.on("tool_result", async (event, ctx) => {
		if (!store) return;
		const isEgoTool = event.toolName.startsWith("ego_");
		const command =
			event.toolName === "bash" ? String((event.input as { command?: string }).command ?? "") : "";
		if (!isEgoTool && !isEgoCommand(command)) return;

		const text = contentToText(event.content as Array<{ type: string; text?: string }>);

		// 1) task-space lifecycle (from the script source)
		if (command) {
			for (const ev of extractSpaceEvents(command)) store.addSpaceEvent(ev);
		} else if (isEgoTool) {
			store.addSpaceEvent({ name: EGO_SPACE, action: "reuse", ts: Date.now() });
		}

		// 2) navigation: prefer logged pageInfo, fall back to script targets
		const navs = [...extractPageInfos(text), ...(command ? extractNavTargets(command) : [])];
		const space = store.lastSpace();
		for (const n of navs) store.addNav({ ...n, taskSpace: n.taskSpace ?? space });
		if (isEgoTool && typeof (event.input as { url?: string }).url === "string") {
			store.addNav({ url: (event.input as { url: string }).url, ts: Date.now(), taskSpace: EGO_SPACE });
		}

		// 3) screenshots
		const added: Shot[] = [];
		for (const p of extractScreenshotPaths(text)) {
			const shot = store.addShot(p, { toolCallId: event.toolCallId });
			if (shot) added.push(shot);
		}

		// 4) auto-capture safety net
		if (settings.autocapture && added.length === 0 && navs.length > 0) {
			const shot = await autoCapture(store, event.toolCallId);
			if (shot) added.push(shot);
		}

		for (const shot of added) maybeInline(pi, settings, shot);
		refreshWidget(ctx);
	});

	// Inline thumbnail renderer (opt-in).
	pi.registerMessageRenderer("pi-ego-shot", (message, _options, theme) => {
		const details = message.details as { file?: string; url?: string; id?: number } | undefined;
		const container = new Container();
		container.addChild(
			new Text(theme.fg("accent", `📸 #${details?.id ?? "?"} ${details?.url ?? message.content}`), 0, 0),
		);
		if (details?.file) {
			try {
				const data = fs.readFileSync(details.file).toString("base64");
				container.addChild(
					new Image(data, "image/png", { fallbackColor: (s) => theme.fg("dim", s) }, {
						maxWidthCells: 70,
						maxHeightCells: 12,
					}),
				);
			} catch {
				/* fall back to the text line only */
			}
		}
		return container;
	});

	// ---- commands ----

	pi.registerCommand("ego-gallery", {
		description: "Browse this session's browser screenshots (filmstrip)",
		handler: async (_args, ctx) => {
			if (!store || store.shots.length === 0) {
				ctx.ui.notify("pi-ego: no screenshots captured yet this session", "info");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify(`pi-ego: ${store.shots.length} shots in ${store.dir}`, "info");
				return;
			}
			const s = store;
			await ctx.ui.custom<null>(
				(_tui, theme, _kb, done) =>
					new GalleryComponent(
						s,
						theme,
						() => done(null),
						() => runExport(ctx, s),
					),
				{ overlay: true, overlayOptions: { width: "90%", maxHeight: "90%", anchor: "center" } },
			);
		},
	});

	pi.registerCommand("ego-spaces", {
		description: "Show the ego-lite task-space dashboard for this session",
		handler: async (_args, ctx) => {
			if (!store) return;
			if (ctx.mode !== "tui") {
				const open = store.spaceSummary().filter((x) => x.open).length;
				ctx.ui.notify(`pi-ego: ${store.spaceSummary().length} spaces (${open} open)`, "info");
				return;
			}
			const s = store;
			await ctx.ui.custom<null>(
				(_tui, theme, _kb, done) => new SpacesComponent(s, theme, () => done(null)),
				{ overlay: true, overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center" } },
			);
		},
	});

	pi.registerCommand("ego-export", {
		description: "Export this session's browser activity as a self-contained HTML report",
		handler: async (_args, ctx) => {
			if (!store || store.shots.length === 0) {
				ctx.ui.notify("pi-ego: nothing to export yet", "info");
				return;
			}
			runExport(ctx, store);
		},
	});

	pi.registerCommand("ego-learn", {
		description: "Record a reusable ego-lite learnings pack from a domain visited this session",
		handler: async (_args, ctx) => {
			if (!store) return;
			const domains = domainsSeen(store);
			if (domains.length === 0) {
				ctx.ui.notify("pi-ego: no domains visited yet", "info");
				return;
			}
			const pick =
				ctx.hasUI && domains.length > 1
					? await ctx.ui.select("Record learnings for which domain?", domains)
					: domains[0];
			if (!pick) return;
			const res = recordLearning(store, pick);
			ctx.ui.notify(
				`pi-ego: ${res.created ? "created" : "updated"} learnings pack at ${res.dir}`,
				"info",
			);
		},
	});

	pi.registerCommand("ego-inline", {
		description: "Toggle inline screenshot thumbnails in the transcript",
		handler: async (_args, ctx) => {
			settings.inline = !settings.inline;
			ctx.ui.notify(`pi-ego: inline thumbnails ${settings.inline ? "on" : "off"}`, "info");
		},
	});

	pi.registerShortcut("ctrl+g", {
		description: "pi-ego: open screenshot gallery",
		handler: async (ctx) => {
			const cmds = pi.getCommands();
			if (cmds.some((c) => c.name === "ego-gallery")) {
				// reuse the command handler path via a synthetic call
				if (!store || store.shots.length === 0) {
					ctx.ui.notify("pi-ego: no screenshots yet", "info");
					return;
				}
				if (ctx.mode !== "tui") return;
				const s = store;
				await ctx.ui.custom<null>(
					(_tui, theme, _kb, done) =>
						new GalleryComponent(s, theme, () => done(null), () => runExport(ctx, s)),
					{ overlay: true, overlayOptions: { width: "90%", maxHeight: "90%", anchor: "center" } },
				);
			}
		},
	});
}

function runExport(ctx: ExtensionContext, store: EgoStore): void {
	try {
		const out = exportHtml(store);
		ctx.ui.notify(`pi-ego: exported ${store.shots.length} shots to ${out}`, "info");
		const opener =
			process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
		spawn(opener, [out], { detached: true, stdio: "ignore" }).unref();
	} catch (err) {
		ctx.ui.notify(`pi-ego: export failed: ${(err as Error).message}`, "error");
	}
}

function maybeInline(pi: ExtensionAPI, settings: Settings, shot: Shot): void {
	if (!settings.inline) return;
	pi.sendMessage({
		customType: "pi-ego-shot",
		content: shot.url ?? `screenshot #${shot.id}`,
		display: true,
		details: { file: shot.file, url: shot.url, id: shot.id },
	});
}

/** Reuse the agent task space to grab a screenshot the agent forgot to take. */
async function autoCapture(store: EgoStore, toolCallId: string): Promise<Shot | null> {
	const { ok, out } = await runEgo(
		`const task = await useOrCreateTaskSpace(${JSON.stringify(EGO_SPACE)})
const tab = await ensureRealTab()
if (tab) {
  const shot = await captureScreenshot()
  cliLog('screenshot path: ' + shot)
}\n`,
		30000,
	);
	if (!ok) return null;
	const m = out.match(/\/[^\s"'`]*ego-browser-shot-[\w.-]+\.png/);
	if (!m) return null;
	return store.addShot(m[0], { toolCallId });
}
