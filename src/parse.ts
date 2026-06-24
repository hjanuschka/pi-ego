import type { NavEvent, SpaceAction, SpaceEvent } from "./types.ts";

/** True when a bash command is driving the ego-lite browser. */
export function isEgoCommand(command: string | undefined): boolean {
	if (!command) return false;
	return /\bego-browser\b/.test(command) && /\bnodejs\b/.test(command);
}

/** Collect text from a tool result's content blocks. */
export function contentToText(content: Array<{ type: string; text?: string }>): string {
	return content
		.map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
		.join("\n");
}

/**
 * Find screenshot file paths in ego-browser output.
 * Matches the canonical ego-browser-shot-*.png names plus any absolute .png
 * path (captureScreenshot can be pointed at a custom path).
 */
export function extractScreenshotPaths(text: string): string[] {
	const found = new Set<string>();
	const egoShot = /\/[^\s"'`]*ego-browser-shot-[\w.-]+\.png/g;
	for (const m of text.matchAll(egoShot)) found.add(stripTrailing(m[0]));
	// generic absolute png paths (e.g. custom captureScreenshot targets)
	const genericPng = /(?:^|[\s"'`=(])(\/[^\s"'`)]+\.png)/g;
	for (const m of text.matchAll(genericPng)) found.add(stripTrailing(m[1]));
	return [...found];
}

function stripTrailing(p: string): string {
	return p.replace(/[)"'`,.]+$/, "");
}

/** A screenshot path paired with the page it was taken on. */
export interface ShotContext {
	path: string;
	url?: string;
	title?: string;
}

/**
 * Pair each screenshot with the page it belongs to by walking the output in
 * order: a screenshot inherits the most recent preceding pageInfo. This keeps
 * multi-page heredocs (open A, shoot, open B, shoot, ...) from labelling every
 * shot with the last URL seen.
 */
export function extractShotContexts(text: string): ShotContext[] {
	const events: Array<{ idx: number; url?: string; title?: string; path?: string }> = [];

	const objRe = /\{[^{}]*"url"\s*:\s*"[^"]+"[^{}]*\}/g;
	for (const m of text.matchAll(objRe)) {
		try {
			const obj = JSON.parse(m[0]) as { url?: string; title?: string };
			if (obj.url && /^https?:/i.test(obj.url)) {
				events.push({ idx: m.index ?? 0, url: obj.url, title: obj.title });
			}
		} catch {
			// not valid JSON, skip
		}
	}

	const egoShot = /\/[^\s"'`]*ego-browser-shot-[\w.-]+\.png/g;
	for (const m of text.matchAll(egoShot)) {
		events.push({ idx: m.index ?? 0, path: stripTrailing(m[0]) });
	}
	const genericPng = /(?:^|[\s"'`=(])(\/[^\s"'`)]+\.png)/g;
	for (const m of text.matchAll(genericPng)) {
		events.push({ idx: (m.index ?? 0) + m[0].indexOf(m[1]), path: stripTrailing(m[1]) });
	}

	events.sort((a, b) => a.idx - b.idx);

	const out: ShotContext[] = [];
	const seen = new Set<string>();
	let curUrl: string | undefined;
	let curTitle: string | undefined;
	for (const ev of events) {
		if (ev.path === undefined) {
			curUrl = ev.url;
			curTitle = ev.title;
		} else if (!seen.has(ev.path)) {
			seen.add(ev.path);
			out.push({ path: ev.path, url: curUrl, title: curTitle });
		}
	}
	return out;
}

/**
 * Pull {url,title,...} objects out of pageInfo()/JSON output.
 * ego-browser's pageInfo resolves to { url, title, w, h, ... }.
 */
export function extractPageInfos(text: string): NavEvent[] {
	const out: NavEvent[] = [];
	const objRe = /\{[^{}]*"url"\s*:\s*"[^"]+"[^{}]*\}/g;
	for (const m of text.matchAll(objRe)) {
		try {
			const obj = JSON.parse(m[0]) as { url?: string; title?: string };
			if (obj.url && /^https?:/i.test(obj.url)) {
				out.push({ url: obj.url, title: obj.title, ts: Date.now() });
			}
		} catch {
			// not valid JSON, skip
		}
	}
	return out;
}

/**
 * Navigation targets taken from the script itself (openOrReuseTab/gotoAndWait/
 * gotoUrl). These give URLs even when the agent never logs pageInfo.
 */
export function extractNavTargets(command: string): NavEvent[] {
	const out: NavEvent[] = [];
	const re =
		/\b(?:openOrReuseTab|gotoAndWait|gotoUrl|ensureRealTab)\s*\(\s*(['"`])(https?:\/\/[^'"`]+)\1/g;
	for (const m of command.matchAll(re)) {
		out.push({ url: m[2], ts: Date.now() });
	}
	return out;
}

const SPACE_HELPERS: Array<{ re: RegExp; action: SpaceAction }> = [
	{ re: /\buseOrCreateTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "create" },
	{ re: /\bnewTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "create" },
	{ re: /\bclaimTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "takeover" },
	{ re: /\bswitchTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "reuse" },
	{ re: /\btakeOverTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "takeover" },
	{ re: /\bhandOffTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "handoff" },
	{ re: /\bcompleteTaskSpace\s*\(\s*(['"`])([^'"`]+)\1/g, action: "complete" },
];

/** Task-space lifecycle events inferred from the script source. */
export function extractSpaceEvents(command: string): SpaceEvent[] {
	const out: SpaceEvent[] = [];
	for (const { re, action } of SPACE_HELPERS) {
		for (const m of command.matchAll(re)) {
			out.push({ name: m[2], action, ts: Date.now() });
		}
	}
	return out;
}
