import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ROUND_END_DELAY_MS, ROUND_START_COUNTDOWN_MS } from "@/shared/constants";
import type { PlayerInfo } from "@/shared/types/room";
import type {
	WordGuessConfig,
	WordGuessPlayerView,
	WordGuessState,
} from "@/shared/types/word-guess";

// Mock getWord to return predictable words
let wordCounter = 0;
mock.module("./words", () => ({
	getWord: () => `word-${++wordCounter}`,
}));

// Import plugin AFTER mock is set up
const { wordGuessPlugin: plugin } = await import("./plugin");

// --- Helpers ---

function makePlayers(count: number): PlayerInfo[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		avatarSeed: i * 30,
		isHost: i === 0,
		isConnected: true,
		isSpectator: false,
	}));
}

const ffaConfig: WordGuessConfig = {
	mode: "ffa",
	roundTimeSeconds: 60,
	cycles: 1,
	wordLanguage: "ru",
	difficulty: "all",
};

const teamsConfig: WordGuessConfig = {
	mode: "teams",
	roundTimeSeconds: 60,
	cycles: 1,
	wordLanguage: "ru",
	difficulty: "all",
	teams: { a: ["p1", "p2"], b: ["p3", "p4"] },
};

function ffaState(playerCount = 2, config?: Partial<WordGuessConfig>): WordGuessState {
	return plugin.createInitialState(makePlayers(playerCount), {
		...ffaConfig,
		...config,
	});
}

function teamsState(): WordGuessState {
	return plugin.createInitialState(makePlayers(4), teamsConfig);
}

/** Advance state from "starting" to "explaining" via beginRound action */
function beginRound(state: WordGuessState): WordGuessState {
	return plugin.reduce(state, { type: "beginRound" }, "__server__")!;
}

/** Create FFA state already in explaining phase */
function ffaExplaining(playerCount = 2, config?: Partial<WordGuessConfig>): WordGuessState {
	return beginRound(ffaState(playerCount, config));
}

/** Create teams state already in explaining phase */
function teamsExplaining(): WordGuessState {
	return beginRound(teamsState());
}

beforeEach(() => {
	wordCounter = 0;
});

// --- Tests ---

describe("wordGuessPlugin", () => {
	describe("createInitialState", () => {
		test("FFA 2 players: correct initial state", () => {
			const state = ffaState(2);

			expect(state.phase).toBe("starting");
			expect(state.mode).toBe("ffa");
			expect(state.currentRound).toBe(1);
			expect(state.totalRounds).toBe(2); // 2 players × 1 cycle
			expect(state.explainerOrder).toHaveLength(2);
			expect(state.currentExplainerId).toBe(state.explainerOrder[0]!);
			expect(state.currentWord).toBeDefined();
			expect(state.wordsUsedByTeam.__all__).toHaveLength(1);
			expect(state.roundResults).toHaveLength(0);
			expect(state.teams).toBeNull();
			expect(state.teamScores).toBeNull();
		});

		test("FFA 3 players, 2 cycles: totalRounds = 6", () => {
			const state = ffaState(3, { cycles: 2 });

			expect(state.totalRounds).toBe(6);
			expect(state.explainerOrder).toHaveLength(6);
		});

		test("FFA: all players in explainerOrder", () => {
			const state = ffaState(3);
			const ids = new Set(state.explainerOrder);

			expect(ids.has("p1")).toBe(true);
			expect(ids.has("p2")).toBe(true);
			expect(ids.has("p3")).toBe(true);
		});

		test("FFA: players have score 0 and no teamId", () => {
			const state = ffaState(2);

			for (const p of state.players) {
				expect(p.score).toBe(0);
				expect(p.teamId).toBeNull();
			}
		});

		test("Teams: teams and teamScores initialized", () => {
			const state = teamsState();

			expect(state.teams).toEqual({ a: ["p1", "p2"], b: ["p3", "p4"] });
			expect(state.teamScores).toEqual({ a: 0, b: 0 });
		});

		test("Teams: players have correct teamId", () => {
			const state = teamsState();

			const p1 = state.players.find((p) => p.id === "p1")!;
			const p3 = state.players.find((p) => p.id === "p3")!;

			expect(p1.teamId).toBe("a");
			expect(p3.teamId).toBe("b");
		});

		test("Teams with uneven sizes: each assigned player explains once per cycle", () => {
			const state = plugin.createInitialState(makePlayers(5), {
				...teamsConfig,
				teams: { a: ["p1", "p2"], b: ["p3", "p4", "p5"] },
			});

			expect(state.totalRounds).toBe(5);
			expect(new Set(state.explainerOrder).size).toBe(5);
			expect(state.explainerOrder).toEqual(expect.arrayContaining(["p1", "p2", "p3", "p4", "p5"]));
		});

		test("timerEndsAt is approximately now + ROUND_START_COUNTDOWN_MS", () => {
			const before = Date.now();
			const state = ffaState(2);
			const after = Date.now();

			expect(state.timerEndsAt).toBeGreaterThanOrEqual(before + ROUND_START_COUNTDOWN_MS);
			expect(state.timerEndsAt).toBeLessThanOrEqual(after + ROUND_START_COUNTDOWN_MS);
		});

		test("custom roundTimeSeconds applied", () => {
			const state = ffaState(2, { roundTimeSeconds: 30 });

			expect(state.roundTimeSeconds).toBe(30);
		});
	});

	describe("beginRound", () => {
		test("transitions from starting to explaining", () => {
			const state = ffaState(2);
			expect(state.phase).toBe("starting");

			const next = beginRound(state);
			expect(next.phase).toBe("explaining");
		});

		test("sets timerEndsAt to now + roundTimeSeconds", () => {
			const before = Date.now();
			const state = ffaState(2);
			const next = beginRound(state);
			const after = Date.now();

			const expected = state.roundTimeSeconds * 1000;
			expect(next.timerEndsAt).toBeGreaterThanOrEqual(before + expected);
			expect(next.timerEndsAt).toBeLessThanOrEqual(after + expected);
		});

		test("rejects if not in starting phase", () => {
			const state = ffaExplaining(2);
			expect(plugin.validateAction(state, { type: "beginRound" }, "__server__")).toBe(
				"Not in starting phase",
			);
		});

		test("rejects non-server caller", () => {
			const state = ffaState(2);
			expect(plugin.validateAction(state, { type: "beginRound" }, "p1")).toBe(
				"Only server can begin round",
			);
		});
	});

	describe("validateAction — correct", () => {
		test("allows explainer with guesserId in FFA", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			expect(
				plugin.validateAction(state, { type: "correct", guesserId: guesser }, explainer),
			).toBeNull();
		});

		test("rejects non-explainer", () => {
			const state = ffaExplaining(2);
			const nonExplainer = state.players.find((p) => p.id !== state.currentExplainerId)!.id;

			expect(
				plugin.validateAction(
					state,
					{ type: "correct", guesserId: state.currentExplainerId },
					nonExplainer,
				),
			).not.toBeNull();
		});

		test("rejects outside explaining phase", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };
			const explainer = state.currentExplainerId;

			expect(plugin.validateAction(state, { type: "correct", guesserId: "p2" }, explainer)).toBe(
				"Not in explaining phase",
			);
		});

		test("rejects FFA without guesserId", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;

			expect(plugin.validateAction(state, { type: "correct" }, explainer)).toBe(
				"Must specify who guessed",
			);
		});

		test("rejects FFA when guesserId is explainer", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;

			expect(
				plugin.validateAction(state, { type: "correct", guesserId: explainer }, explainer),
			).toBe("Explainer cannot be the guesser");
		});

		test("rejects FFA when guesserId not found", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;

			expect(
				plugin.validateAction(state, { type: "correct", guesserId: "unknown" }, explainer),
			).toBe("Guesser not found");
		});

		test("allows teams mode without guesserId", () => {
			const state = teamsExplaining();
			const explainer = state.currentExplainerId;

			expect(plugin.validateAction(state, { type: "correct" }, explainer)).toBeNull();
		});
	});

	describe("validateAction — skip", () => {
		test("allows explainer", () => {
			const state = ffaExplaining(2);
			expect(plugin.validateAction(state, { type: "skip" }, state.currentExplainerId)).toBeNull();
		});

		test("rejects non-explainer", () => {
			const state = ffaExplaining(2);
			const other = state.players.find((p) => p.id !== state.currentExplainerId)!.id;
			expect(plugin.validateAction(state, { type: "skip" }, other)).not.toBeNull();
		});

		test("rejects outside explaining phase", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };
			expect(plugin.validateAction(state, { type: "skip" }, state.currentExplainerId)).toBe(
				"Not in explaining phase",
			);
		});
	});

	describe("validateAction — timerExpired", () => {
		test("allows __server__", () => {
			const state = ffaExplaining(2);
			expect(plugin.validateAction(state, { type: "timerExpired" }, "__server__")).toBeNull();
		});

		test("rejects regular player", () => {
			const state = ffaExplaining(2);
			expect(plugin.validateAction(state, { type: "timerExpired" }, "p1")).toBe(
				"Only server can expire timer",
			);
		});

		test("rejects outside explaining phase", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };
			expect(plugin.validateAction(state, { type: "timerExpired" }, "__server__")).toBe(
				"Not in explaining phase",
			);
		});
	});

	describe("validateAction — nextRound", () => {
		test("allows in roundEnd phase", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };
			expect(plugin.validateAction(state, { type: "nextRound" }, "__server__")).toBeNull();
		});

		test("rejects outside roundEnd phase", () => {
			const state = ffaExplaining(2);
			expect(plugin.validateAction(state, { type: "nextRound" }, "__server__")).toBe(
				"Not in round end phase",
			);
		});
	});

	describe("validateAction — unknown", () => {
		test("rejects unknown action type", () => {
			const state = ffaState(2);
			expect(plugin.validateAction(state, { type: "banana" } as any, "p1")).toBe("Unknown action");
		});
	});

	describe("reduce — correct (FFA)", () => {
		test("awards +1 to guesser only", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			const next = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			const explainerScore = next.players.find((p) => p.id === explainer)!.score;
			const guesserScore = next.players.find((p) => p.id === guesser)!.score;

			expect(explainerScore).toBe(0);
			expect(guesserScore).toBe(1);
		});

		test("fetches new word and tracks in wordsUsedByTeam", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;
			const oldWord = state.currentWord;

			const next = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			const used = next.wordsUsedByTeam.__all__!;
			expect(next.currentWord).not.toBe(oldWord);
			expect(used).toContain(oldWord);
			expect(used).toContain(next.currentWord);
		});

		test("adds to roundResults", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;
			const word = state.currentWord;

			const next = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			expect(next.roundResults).toHaveLength(1);
			expect(next.roundResults[0]).toEqual({
				word,
				result: "correct",
				guesserId: guesser,
			});
		});

		test("stays in explaining phase", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			const next = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			expect(next.phase).toBe("explaining");
		});
	});

	describe("reduce — correct (Teams)", () => {
		test("awards +1 to team score", () => {
			const state = teamsExplaining();
			const explainer = state.currentExplainerId;
			const explainerPlayer = state.players.find((p) => p.id === explainer)!;

			const next = plugin.reduce(state, { type: "correct" }, explainer)!;

			expect(next.teamScores![explainerPlayer.teamId!]).toBe(1);
		});
	});

	describe("reduce — skip", () => {
		test("scores unchanged on skip", () => {
			const state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const other = state.players.find((p) => p.id !== explainer)!.id;

			const next = plugin.reduce(state, { type: "skip" }, explainer)!;

			expect(next.players.find((p) => p.id === explainer)!.score).toBe(0);
			expect(next.players.find((p) => p.id === other)!.score).toBe(0);
		});

		test("adds skipped result to roundResults", () => {
			const state = ffaExplaining(2);
			const word = state.currentWord;

			const next = plugin.reduce(state, { type: "skip" }, state.currentExplainerId)!;

			expect(next.roundResults).toHaveLength(1);
			expect(next.roundResults[0]).toEqual({
				word,
				result: "skipped",
				guesserId: null,
			});
		});

		test("Teams: team score unchanged on skip", () => {
			const state = teamsExplaining();
			const explainer = state.currentExplainerId;
			const explainerPlayer = state.players.find((p) => p.id === explainer)!;

			const next = plugin.reduce(state, { type: "skip" }, explainer)!;

			expect(next.teamScores![explainerPlayer.teamId!]).toBe(0);
		});

		test("fetches new word", () => {
			const state = ffaExplaining(2);
			const oldWord = state.currentWord;

			const next = plugin.reduce(state, { type: "skip" }, state.currentExplainerId)!;

			expect(next.currentWord).not.toBe(oldWord);
		});
	});

	describe("reduce — timerExpired", () => {
		test("transitions to roundEnd", () => {
			const state = ffaExplaining(2);
			const next = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;

			expect(next.phase).toBe("roundEnd");
		});

		test("preserves roundResults and scores", () => {
			let state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			// Do a correct guess first
			state = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;
			const next = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;

			expect(next.roundResults).toHaveLength(1);
			expect(next.players.find((p) => p.id === guesser)!.score).toBe(1);
		});
	});

	describe("reduce — nextRound", () => {
		test("advances to next round with new explainer via starting phase", () => {
			let state = ffaExplaining(2);
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			const firstExplainer = state.currentExplainerId;

			const next = plugin.reduce(state, { type: "nextRound" }, "__server__")!;

			expect(next.phase).toBe("starting");
			expect(next.currentRound).toBe(2);
			expect(next.currentExplainerId).toBe(state.explainerOrder[1]!);
			expect(next.currentExplainerId).not.toBe(firstExplainer);
			expect(next.roundResults).toHaveLength(0);
		});

		test("sets timerEndsAt to ROUND_START_COUNTDOWN_MS", () => {
			let state = ffaExplaining(2);
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			const before = Date.now();

			const next = plugin.reduce(state, { type: "nextRound" }, "__server__")!;

			expect(next.timerEndsAt).toBeGreaterThanOrEqual(before + ROUND_START_COUNTDOWN_MS);
		});

		test("fetches new word", () => {
			let state = ffaExplaining(2);
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			const oldWord = state.currentWord;

			const next = plugin.reduce(state, { type: "nextRound" }, "__server__")!;

			expect(next.currentWord).not.toBe(oldWord);
			expect(next.wordsUsedByTeam.__all__).toContain(next.currentWord);
		});

		test("transitions to gameOver on last round", () => {
			let state = ffaExplaining(2);
			state = {
				...state,
				phase: "roundEnd" as const,
				currentRound: 2,
				totalRounds: 2,
			};

			const next = plugin.reduce(state, { type: "nextRound" }, "__server__")!;

			expect(next.phase).toBe("gameOver");
		});
	});

	describe("getPlayerView", () => {
		test("explainer sees currentWord in explaining phase", () => {
			const state = ffaExplaining(2);
			const view = plugin.getPlayerView(state, state.currentExplainerId) as WordGuessPlayerView;

			expect(view.currentWord).toBe(state.currentWord);
			expect(view.isExplainer).toBe(true);
		});

		test("explainer does not see currentWord in starting phase", () => {
			const state = ffaState(2);
			const view = plugin.getPlayerView(state, state.currentExplainerId) as WordGuessPlayerView;

			expect(view.currentWord).toBeNull();
		});

		test("non-explainer does not see currentWord in explaining phase", () => {
			const state = ffaExplaining(2);
			const other = state.players.find((p) => p.id !== state.currentExplainerId)!.id;
			const view = plugin.getPlayerView(state, other) as WordGuessPlayerView;

			expect(view.currentWord).toBeNull();
			expect(view.isExplainer).toBe(false);
		});

		test("nobody sees currentWord in roundEnd phase", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };

			const explainerView = plugin.getPlayerView(
				state,
				state.currentExplainerId,
			) as WordGuessPlayerView;
			const otherView = plugin.getPlayerView(
				state,
				state.players.find((p) => p.id !== state.currentExplainerId)!.id,
			) as WordGuessPlayerView;

			expect(explainerView.currentWord).toBeNull();
			expect(otherView.currentWord).toBeNull();
		});

		test("roundResults empty during explaining, filled during roundEnd", () => {
			let state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			// Add a correct result
			state = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			// During explaining: roundResults available (for watchers to see progress)
			const viewExplaining = plugin.getPlayerView(state, explainer) as WordGuessPlayerView;
			expect(viewExplaining.roundResults).toHaveLength(1);
			expect(viewExplaining.roundCorrectCount).toBe(1);

			// Transition to roundEnd — still has results
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			const viewRoundEnd = plugin.getPlayerView(state, explainer) as WordGuessPlayerView;
			expect(viewRoundEnd.roundResults).toHaveLength(1);
		});

		test("roundCorrectCount and roundSkipCount are accurate", () => {
			let state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			state = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;
			state = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;
			state = plugin.reduce(state, { type: "skip" }, explainer)!;

			const view = plugin.getPlayerView(state, explainer) as WordGuessPlayerView;
			expect(view.roundCorrectCount).toBe(2);
			expect(view.roundSkipCount).toBe(1);
		});
	});

	describe("getSpectatorView", () => {
		test("always sees currentWord", () => {
			const state = ffaExplaining(2);
			const view = plugin.getSpectatorView(state) as WordGuessPlayerView;

			expect(view.currentWord).toBe(state.currentWord);
			expect(view.isExplainer).toBe(false);
		});

		test("always has roundResults", () => {
			let state = ffaExplaining(2);
			const explainer = state.currentExplainerId;
			const guesser = state.players.find((p) => p.id !== explainer)!.id;

			state = plugin.reduce(state, { type: "correct", guesserId: guesser }, explainer)!;

			const view = plugin.getSpectatorView(state) as WordGuessPlayerView;
			expect(view.roundResults).toHaveLength(1);
		});
	});

	describe("getTimerConfig", () => {
		test("starting phase: returns beginRound config", () => {
			const state = ffaState(2);
			const config = plugin.getTimerConfig!(state);

			expect(config).not.toBeNull();
			expect(config!.key).toBe("starting-1");
			expect(config!.action).toEqual({ type: "beginRound" });
			expect(config!.durationMs).toBeGreaterThan(0);
			expect(config!.durationMs).toBeLessThanOrEqual(ROUND_START_COUNTDOWN_MS);
		});

		test("explaining phase: returns timerExpired config", () => {
			const state = ffaExplaining(2);
			const config = plugin.getTimerConfig!(state);

			expect(config).not.toBeNull();
			expect(config!.key).toBe("explaining-1");
			expect(config!.action).toEqual({ type: "timerExpired" });
			expect(config!.durationMs).toBeGreaterThan(0);
		});

		test("roundEnd phase: returns nextRound config", () => {
			let state = ffaExplaining(2);
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			const config = plugin.getTimerConfig!(state);

			expect(config).not.toBeNull();
			expect(config!.key).toBe("roundEnd-1");
			expect(config!.action).toEqual({ type: "nextRound" });
			expect(config!.durationMs).toBeGreaterThan(0);
			expect(config!.durationMs).toBeLessThanOrEqual(ROUND_END_DELAY_MS);
		});

		test("gameOver phase: returns null", () => {
			const state = { ...ffaExplaining(2), phase: "gameOver" as const };
			const config = plugin.getTimerConfig!(state);

			expect(config).toBeNull();
		});
	});

	describe("isGameOver", () => {
		test("true when phase is gameOver", () => {
			const state = { ...ffaState(2), phase: "gameOver" as const };
			expect(plugin.isGameOver(state)).toBe(true);
		});

		test("false when phase is starting", () => {
			const state = ffaState(2);
			expect(plugin.isGameOver(state)).toBe(false);
		});

		test("false when phase is explaining", () => {
			const state = ffaExplaining(2);
			expect(plugin.isGameOver(state)).toBe(false);
		});

		test("false when phase is roundEnd", () => {
			const state = { ...ffaExplaining(2), phase: "roundEnd" as const };
			expect(plugin.isGameOver(state)).toBe(false);
		});
	});

	describe("full game flow", () => {
		test("FFA 2 players: complete game with correct scoring", () => {
			let state = ffaExplaining(2);
			const explainer1 = state.currentExplainerId;
			const guesser1 = state.players.find((p) => p.id !== explainer1)!.id;

			// Round 1: 3 correct, 1 skip
			state = plugin.reduce(state, { type: "correct", guesserId: guesser1 }, explainer1)!;
			state = plugin.reduce(state, { type: "correct", guesserId: guesser1 }, explainer1)!;
			state = plugin.reduce(state, { type: "correct", guesserId: guesser1 }, explainer1)!;
			state = plugin.reduce(state, { type: "skip" }, explainer1)!;

			// After round 1: guesser1 = +3 (only guesser gets points), explainer1 = 0
			expect(state.players.find((p) => p.id === guesser1)!.score).toBe(3);
			expect(state.players.find((p) => p.id === explainer1)!.score).toBe(0);

			// Timer expires, round ends
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			expect(state.phase).toBe("roundEnd");
			expect(state.roundResults).toHaveLength(4);

			// Next round: goes to starting, then beginRound
			state = plugin.reduce(state, { type: "nextRound" }, "__server__")!;
			expect(state.phase).toBe("starting");
			expect(state.currentRound).toBe(2);

			state = beginRound(state);
			expect(state.phase).toBe("explaining");
			const explainer2 = state.currentExplainerId;
			expect(explainer2).toBe(state.explainerOrder[1]!);
			expect(explainer2).not.toBe(explainer1);

			const guesser2 = state.players.find((p) => p.id !== explainer2)!.id;

			// Round 2: 2 correct
			state = plugin.reduce(state, { type: "correct", guesserId: guesser2 }, explainer2)!;
			state = plugin.reduce(state, { type: "correct", guesserId: guesser2 }, explainer2)!;

			// Timer expires, round ends
			state = plugin.reduce(state, { type: "timerExpired" }, "__server__")!;
			expect(state.phase).toBe("roundEnd");

			// Last round → game over
			state = plugin.reduce(state, { type: "nextRound" }, "__server__")!;
			expect(state.phase).toBe("gameOver");
			expect(plugin.isGameOver(state)).toBe(true);

			// Final scores (only guessers get points):
			// guesser1 (round 1) = +3, guesser2 (round 2) = +2
			// Since explainer2 = guesser1 and guesser2 = explainer1:
			// explainer1 total = 0 + 2 = 2, guesser1 total = 3 + 0 = 3
			const scores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
			expect(scores[explainer1]).toBe(2);
			expect(scores[guesser1]).toBe(3);
		});
	});
});
