import { describe, expect, test } from "bun:test";
import { DEFAULT_PERUDO_CONFIG } from "@/shared/types/perudo";
import type { PlayerInfo } from "@/shared/types/room";
import { perudoPlugin } from "./plugin";

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

describe("perudoPlugin", () => {
	test("merges default config when room gameConfig is empty", () => {
		const state = perudoPlugin.createInitialState(
			makePlayers(2),
			{} as typeof DEFAULT_PERUDO_CONFIG,
		);

		expect(state.turnTimeMs).toBe(DEFAULT_PERUDO_CONFIG.turnTimeSeconds * 1000);
		expect(state.palificoEnabled).toBe(DEFAULT_PERUDO_CONFIG.palifico);
	});

	test("startRound uses a finite timer with empty config", () => {
		const initial = perudoPlugin.createInitialState(
			makePlayers(2),
			{} as typeof DEFAULT_PERUDO_CONFIG,
		);
		const next = perudoPlugin.reduce(initial, { type: "startRound" }, "__server__");

		expect(next).not.toBeNull();
		expect(Number.isFinite(next!.timerEndsAt)).toBe(true);
		expect(next!.phase).toBe("bidding");
	});
});
