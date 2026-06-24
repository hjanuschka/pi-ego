import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EgoStore } from "./store.ts";

/**
 * Distill what the browser did on a given domain this session into an ego-lite
 * "learnings" pack: a manifest + notes seeded with the URLs actually visited.
 * This is the local, do-it-yourself version of ego-lite's "experience
 * accumulation", written into your agent-config so it is reusable and tracked.
 */

function domainOf(url: string): string | undefined {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return undefined;
	}
}

function slug(domain: string): string {
	return domain.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export function domainsSeen(store: EgoStore): string[] {
	const counts = new Map<string, number>();
	for (const n of store.navs) {
		const d = domainOf(n.url);
		if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
	}
	for (const s of store.shots) {
		if (!s.url) continue;
		const d = domainOf(s.url);
		if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

export interface LearnResult {
	dir: string;
	created: boolean;
}

/**
 * Write a learnings scaffold for `domain` under
 * ~/agent-config/skills/ego-browser-learnings/<slug>/ (falls back to the user's
 * home if agent-config is absent). Returns the path written.
 */
export function recordLearning(store: EgoStore, domain: string): LearnResult {
	const base = path.join(os.homedir(), "agent-config", "skills", "ego-browser-learnings");
	const root = fs.existsSync(path.dirname(base))
		? base
		: path.join(os.homedir(), ".pi", "ego", "learnings");
	const dir = path.join(root, slug(domain));
	const existed = fs.existsSync(dir);
	fs.mkdirSync(path.join(dir, "notes"), { recursive: true });

	const urls = [
		...new Set(
			[...store.navs, ...store.shots]
				.map((x) => ("url" in x ? x.url : undefined))
				.filter((u): u is string => !!u && domainOf(u) === domain),
		),
	];

	const manifest = {
		id: slug(domain),
		name: domain,
		domains: [domain, `*.${domain}`],
		notes: ["notes/overview.md"],
		nodeTools: {},
		browserTools: {},
	};
	fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

	const seenTitles = [...store.shots, ...store.navs]
		.filter((x) => x.url && domainOf(x.url) === domain && "title" in x && x.title)
		.map((x) => `- ${(x as { title?: string }).title} -- ${x.url}`);

	const overview = [
		`# ${domain}`,
		"",
		"Captured by pi-ego from a real session. Promote the stable parts into",
		"durable selectors / nodeTools; delete anything session-specific.",
		"",
		"## URLs visited",
		"",
		...urls.map((u) => `- ${u}`),
		"",
		...(seenTitles.length ? ["## Pages seen", "", ...seenTitles, ""] : []),
		"## Next steps",
		"",
		"- Replace ad-hoc clicks with stable CSS / loc= selectors.",
		"- Add a nodeTool in tools/ for the main extract path.",
		"- Keep it site-shaped: stable URLs, no pixel coordinates, no secrets.",
		"",
	].join("\n");
	fs.writeFileSync(path.join(dir, "notes", "overview.md"), overview);

	return { dir, created: !existed };
}
