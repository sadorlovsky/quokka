import { describe, expect, test } from "bun:test";
import { HANGMAN_TURN_TIMER_MS, HANGMAN_WORD_PICK_TIMER_MS } from "@/shared/types/hangman";
import type { PlayerInfo } from "@/shared/types/room";
import { hangmanPlugin } from "./plugin";

function makePlayers(count: number): PlayerInfo[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		avatarSeed: i,
		isHost: i === 0,
		isConnected: true,
		isSpectator: false,
	}));
}

describe("hangmanPlugin", () => {
	test("beginRound starts a timed word-picking phase", () => {
		const state = hangmanPlugin.createInitialState(makePlayers(3), {});
		const before = Date.now();
		const next = hangmanPlugin.reduce(state, { type: "beginRound" }, "__server__");
		const after = Date.now();

		expect(next).not.toBeNull();
		expect(next!.phase).toBe("pickingWord");
		expect(next!.timerEndsAt).toBeGreaterThanOrEqual(before + HANGMAN_WORD_PICK_TIMER_MS);
		expect(next!.timerEndsAt).toBeLessThanOrEqual(after + HANGMAN_WORD_PICK_TIMER_MS);
	});

	test("wordPickTimeout auto-selects a fallback word and continues the round", () => {
		const state = hangmanPlugin.reduce(
			hangmanPlugin.createInitialState(makePlayers(3), {}),
			{ type: "beginRound" },
			"__server__",
		)!;
		const before = Date.now();
		const next = hangmanPlugin.reduce(state, { type: "wordPickTimeout" }, "__server__");
		const after = Date.now();

		expect(next).not.toBeNull();
		expect(next!.phase).toBe("guessing");
		expect(next!.currentWord.length).toBeGreaterThanOrEqual(3);
		expect(next!.timerEndsAt).toBeGreaterThanOrEqual(before + HANGMAN_TURN_TIMER_MS);
		expect(next!.timerEndsAt).toBeLessThanOrEqual(after + HANGMAN_TURN_TIMER_MS);
	});
});
