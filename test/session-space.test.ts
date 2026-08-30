import assert from "node:assert/strict";
import test from "node:test";
import {
	egoSpaceForSession,
	egoTaskPrelude,
	egoTaskPreludeForSession,
} from "../src/session-space.ts";

const SESSION_A = "01a0541d-2f3c-7bbc-b284-b410ba788bb4";
const SESSION_B = "01a053c5-b3ce-72fc-9089-5a6a7d7bbf7d";

test("different Pi sessions receive distinct stable Ego task spaces", () => {
	const first = egoSpaceForSession(SESSION_A);
	const second = egoSpaceForSession(SESSION_B);

	assert.equal(first, `pi-agent:${SESSION_A}`);
	assert.equal(second, `pi-agent:${SESSION_B}`);
	assert.equal(egoSpaceForSession(SESSION_A), first);
	assert.notEqual(first, second);
});

test("task-space scripts use the current Pi session ID", () => {
	const first = egoTaskPreludeForSession(SESSION_A);
	const second = egoTaskPreludeForSession(SESSION_B);

	assert.equal(first, `const task = await useOrCreateTaskSpace("pi-agent:${SESSION_A}")\n`);
	assert.equal(second, `const task = await useOrCreateTaskSpace("pi-agent:${SESSION_B}")\n`);
	assert.notEqual(first, second);
});

test("task-space names are safely serialized into Ego scripts", () => {
	assert.equal(
		egoTaskPrelude('pi-agent:quoted"session'),
		'const task = await useOrCreateTaskSpace("pi-agent:quoted\\"session")\n',
	);
});

test("empty session IDs and task-space names are rejected", () => {
	assert.throws(() => egoSpaceForSession("  "), /session ID must not be empty/i);
	assert.throws(() => egoTaskPrelude("  "), /task space must not be empty/i);
});
