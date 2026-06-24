import { spawn } from "node:child_process";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Typed wrappers around `ego-browser nodejs`. They give the model first-class
 * ego_* tools (instead of hand-written heredocs), and every result still flows
 * through the same tool_result indexer that powers the gallery/spaces views.
 *
 * All tools reuse one task space so a sequence of calls operates on the same
 * page, mirroring how the skill tells agents to work.
 */

export const EGO_SPACE = "pi-agent";
const SPACE = EGO_SPACE;

export function runEgo(body: string, timeoutMs = 60000): Promise<{ ok: boolean; out: string }> {
	return new Promise((resolve) => {
		const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
		let out = "";
		const onData = (b: Buffer) => {
			out += b.toString();
		};
		child.stdout.on("data", onData);
		child.stderr.on("data", onData);
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				/* already gone */
			}
		}, timeoutMs);
		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({ ok: false, out: `ego-browser failed to start: ${err.message}` });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ ok: code === 0, out: out.trim() });
		});
		child.stdin.write(body);
		child.stdin.end();
	});
}

function header(): string {
	return `const task = await useOrCreateTaskSpace(${JSON.stringify(SPACE)})\n`;
}

export function registerEgoTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ego_open",
		label: "ego open",
		description:
			"Open (or reuse) a URL in the ego-lite browser's agent task space and return page info plus a semantic snapshot. Use for normal navigation.",
		promptSnippet: "Open a URL in the ego-lite browser and snapshot it",
		promptGuidelines: [
			"Use ego_open to navigate the ego-lite browser instead of writing an ego-browser heredoc for simple page loads.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "Absolute URL to open." }),
		}),
		async execute(_id, { url }) {
			const { ok, out } = await runEgo(
				`${header()}await openOrReuseTab(${JSON.stringify(url)}, { wait: true, timeout: 25 })
cliLog(JSON.stringify(await pageInfo()))
cliLog('---SNAPSHOT---')
cliLog(await snapshotText())\n`,
			);
			return { content: [{ type: "text", text: out || "(no output)" }], isError: !ok };
		},
	});

	pi.registerTool({
		name: "ego_snapshot",
		label: "ego snapshot",
		description:
			"Return a fresh semantic snapshot (annotated with refs/locators) of the ego-lite browser's current page.",
		promptSnippet: "Snapshot the current ego-lite page",
		parameters: Type.Object({}),
		async execute() {
			const { ok, out } = await runEgo(
				`${header()}await ensureRealTab()
cliLog(JSON.stringify(await pageInfo()))
cliLog('---SNAPSHOT---')
cliLog(await snapshotText())\n`,
			);
			return { content: [{ type: "text", text: out || "(no output)" }], isError: !ok };
		},
	});

	pi.registerTool({
		name: "ego_screenshot",
		label: "ego screenshot",
		description:
			"Capture a screenshot of the ego-lite browser's current page. The PNG is auto-added to the session gallery (/ego-gallery).",
		promptSnippet: "Screenshot the current ego-lite page (auto-added to gallery)",
		parameters: Type.Object({
			full: Type.Optional(
				Type.Boolean({ description: "Capture the full scrollable page (default false)." }),
			),
		}),
		async execute(_id, { full }) {
			const { ok, out } = await runEgo(
				`${header()}await ensureRealTab()
const info = await pageInfo()
cliLog(JSON.stringify(info))
const shot = await captureScreenshot(undefined, { full: ${full ? "true" : "false"} })
cliLog('screenshot path: ' + shot)\n`,
			);
			return { content: [{ type: "text", text: out || "(no output)" }], isError: !ok };
		},
	});

	pi.registerTool({
		name: "ego_click",
		label: "ego click",
		description:
			"Click a target in the ego-lite browser (CSS selector, xpath=..., @N ref, or loc=... from a snapshot) and return a fresh snapshot.",
		promptSnippet: "Click a target in the ego-lite browser and re-snapshot",
		parameters: Type.Object({
			target: Type.String({
				description: "CSS selector, xpath=..., @N ref, or loc=... locator.",
			}),
			label: Type.Optional(Type.String({ description: "Short action description for the click highlight." })),
		}),
		async execute(_id, { target, label }) {
			const lbl = label ? `, { label: ${JSON.stringify(label)} }` : "";
			const { ok, out } = await runEgo(
				`${header()}await ensureRealTab()
await click(${JSON.stringify(target)}${lbl})
await wait(0.5)
cliLog(JSON.stringify(await pageInfo()))
cliLog('---SNAPSHOT---')
cliLog(await snapshotText())\n`,
			);
			return { content: [{ type: "text", text: out || "(no output)" }], isError: !ok };
		},
	});
}
