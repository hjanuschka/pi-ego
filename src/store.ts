import fs from "node:fs";
import path from "node:path";
import type { NavEvent, SessionIndex, Shot, SpaceEvent } from "./types.ts";

/**
 * Session-scoped store for everything the ego-lite browser did this session.
 * Source of truth is an on-disk index.json under <cwd>/.pi/ego/<sessionId>/,
 * which keeps the gallery and HTML export working even after a /reload.
 */
export class EgoStore {
	readonly dir: string;
	readonly shotsDir: string;
	private index: SessionIndex;

	constructor(cwd: string, sessionId: string) {
		this.dir = path.join(cwd, ".pi", "ego", sessionId);
		this.shotsDir = path.join(this.dir, "shots");
		fs.mkdirSync(this.shotsDir, { recursive: true });
		this.index = this.load(sessionId);
	}

	private indexPath(): string {
		return path.join(this.dir, "index.json");
	}

	private load(sessionId: string): SessionIndex {
		try {
			const raw = fs.readFileSync(this.indexPath(), "utf8");
			const parsed = JSON.parse(raw) as SessionIndex;
			if (parsed && Array.isArray(parsed.shots)) {
				parsed.spaces ??= [];
				parsed.navs ??= [];
				return parsed;
			}
		} catch {
			// no prior index, start fresh
		}
		return { sessionId, createdAt: Date.now(), shots: [], spaces: [], navs: [] };
	}

	private flush(): void {
		try {
			fs.writeFileSync(this.indexPath(), JSON.stringify(this.index, null, 2));
		} catch {
			// best-effort persistence; never break the agent over disk errors
		}
	}

	get shots(): Shot[] {
		return this.index.shots;
	}
	get spaces(): SpaceEvent[] {
		return this.index.spaces;
	}
	get navs(): NavEvent[] {
		return this.index.navs;
	}

	/** Most recent task space name seen, used to attribute shots/navs. */
	lastSpace(): string | undefined {
		for (let i = this.index.spaces.length - 1; i >= 0; i--) {
			const a = this.index.spaces[i].action;
			if (a !== "complete") return this.index.spaces[i].name;
		}
		return undefined;
	}

	/** Most recent navigated URL/title, used to label shots that lack their own. */
	lastNav(): NavEvent | undefined {
		return this.index.navs[this.index.navs.length - 1];
	}

	private alreadyHaveSrc(srcPath: string): boolean {
		return this.index.shots.some((s) => s.srcPath === srcPath);
	}

	/**
	 * Copy a screenshot from its temp path into the store and index it.
	 * Returns the new Shot, or null if the source could not be read or was a dup.
	 */
	addShot(srcPath: string, meta: Partial<Shot> = {}): Shot | null {
		if (this.alreadyHaveSrc(srcPath)) return null;
		let data: Buffer;
		try {
			data = fs.readFileSync(srcPath);
		} catch {
			return null;
		}
		const id = this.index.shots.length + 1;
		const file = path.join(this.shotsDir, `${String(id).padStart(4, "0")}.png`);
		try {
			fs.writeFileSync(file, data);
		} catch {
			return null;
		}
		const shot: Shot = {
			id,
			file,
			srcPath,
			ts: meta.ts ?? Date.now(),
			url: meta.url ?? this.lastNav()?.url,
			title: meta.title ?? this.lastNav()?.title,
			toolCallId: meta.toolCallId,
			taskSpace: meta.taskSpace ?? this.lastSpace(),
		};
		this.index.shots.push(shot);
		this.flush();
		return shot;
	}

	addSpaceEvent(ev: SpaceEvent): void {
		this.index.spaces.push(ev);
		this.flush();
	}

	addNav(ev: NavEvent): void {
		const last = this.lastNav();
		if (last && last.url === ev.url && ev.ts - last.ts < 1500) return; // de-dup bursts
		this.index.navs.push(ev);
		this.flush();
	}

	/** Aggregate task-space view for the dashboard. */
	spaceSummary(): Array<{
		name: string;
		open: boolean;
		events: number;
		lastUrl?: string;
		lastTs: number;
	}> {
		const map = new Map<
			string,
			{ name: string; open: boolean; events: number; lastUrl?: string; lastTs: number }
		>();
		for (const ev of this.index.spaces) {
			const cur = map.get(ev.name) ?? {
				name: ev.name,
				open: true,
				events: 0,
				lastTs: 0,
			};
			cur.events += 1;
			cur.lastTs = Math.max(cur.lastTs, ev.ts);
			if (ev.url) cur.lastUrl = ev.url;
			if (ev.action === "complete") cur.open = false;
			if (ev.action === "create" || ev.action === "reuse" || ev.action === "takeover")
				cur.open = true;
			map.set(ev.name, cur);
		}
		// attribute last nav url per space if missing
		for (const nav of this.index.navs) {
			if (!nav.taskSpace) continue;
			const cur = map.get(nav.taskSpace);
			if (cur && !cur.lastUrl) cur.lastUrl = nav.url;
		}
		return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
	}
}
