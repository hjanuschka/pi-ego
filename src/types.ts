// Shared data model for the pi-ego browser session layer.

export interface Shot {
	/** Sequential id within the session (1-based). */
	id: number;
	/** Absolute path to the stored PNG inside the session store. */
	file: string;
	/** Original temp path emitted by ego-browser, if known. */
	srcPath?: string;
	/** Page URL at capture time, when it could be inferred. */
	url?: string;
	/** Page title at capture time, when it could be inferred. */
	title?: string;
	/** Epoch ms when the shot was indexed. */
	ts: number;
	/** Tool call id that produced the shot (bash or ego_* tool). */
	toolCallId?: string;
	/** Task space name/id active when the shot was taken. */
	taskSpace?: string;
}

export type SpaceAction =
	| "create"
	| "reuse"
	| "complete"
	| "handoff"
	| "takeover";

export interface SpaceEvent {
	name: string;
	action: SpaceAction;
	ts: number;
	url?: string;
}

export interface NavEvent {
	url: string;
	title?: string;
	ts: number;
	taskSpace?: string;
}

export interface SessionIndex {
	sessionId: string;
	createdAt: number;
	shots: Shot[];
	spaces: SpaceEvent[];
	navs: NavEvent[];
}
