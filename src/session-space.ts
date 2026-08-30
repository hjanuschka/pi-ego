const SPACE_PREFIX = "pi-agent";

function requireNonEmpty(value: string, label: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${label} must not be empty`);
	return trimmed;
}

export function egoSpaceForSession(sessionId: string): string {
	return `${SPACE_PREFIX}:${requireNonEmpty(sessionId, "Ego session ID")}`;
}

export function egoTaskPrelude(spaceName: string): string {
	const space = requireNonEmpty(spaceName, "Ego task space");
	return `const task = await useOrCreateTaskSpace(${JSON.stringify(space)})\n`;
}

export function egoTaskPreludeForSession(sessionId: string): string {
	return egoTaskPrelude(egoSpaceForSession(sessionId));
}
