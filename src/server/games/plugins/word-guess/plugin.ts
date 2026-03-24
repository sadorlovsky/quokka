import { ROUND_END_DELAY_MS, ROUND_START_COUNTDOWN_MS } from "@/shared/constants";
import { getRecommendedSettings } from "@/shared/game-settings";
import type { GamePlugin, TimerConfig } from "@/shared/types/game";
import type { PlayerInfo } from "@/shared/types/room";
import type {
	WordGuessAction,
	WordGuessConfig,
	WordGuessDifficulty,
	WordGuessPlayerState,
	WordGuessPlayerView,
	WordGuessState,
} from "@/shared/types/word-guess";
import { DEFAULT_WORD_GUESS_CONFIG } from "@/shared/types/word-guess";
import { wordsMatch } from "@/shared/utils/normalize-word";
import { getWord } from "./words";

function shuffle<T>(arr: T[]): T[] {
	const result = [...arr];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j]!, result[i]!];
	}
	return result;
}

function buildExplainerOrder(players: PlayerInfo[], config: WordGuessConfig): string[] {
	const ids = players.map((p) => p.id);
	const order: string[] = [];

	if (config.mode === "teams" && config.teams) {
		const teamIds = Object.keys(config.teams);
		for (let cycle = 0; cycle < config.cycles; cycle++) {
			// Interleave fresh per-cycle team shuffles so every assigned player explains once per cycle.
			const teamQueues = teamIds.map((tid) => shuffle(config.teams![tid]!));
			const maxLen = Math.max(...teamQueues.map((q) => q.length));
			for (let i = 0; i < maxLen; i++) {
				for (const queue of teamQueues) {
					if (i < queue.length) {
						order.push(queue[i]!);
					}
				}
			}
		}
	} else {
		// FFA: shuffle, repeat for each cycle
		for (let cycle = 0; cycle < config.cycles; cycle++) {
			order.push(...shuffle(ids));
		}
	}

	return order;
}

function createPlayers(players: PlayerInfo[], config: WordGuessConfig): WordGuessPlayerState[] {
	return players.map((p) => {
		let teamId: string | null = null;
		if (config.mode === "teams" && config.teams) {
			for (const [tid, members] of Object.entries(config.teams)) {
				if (members.includes(p.id)) {
					teamId = tid;
					break;
				}
			}
		}
		return {
			id: p.id,
			name: p.name,
			avatarSeed: p.avatarSeed,
			score: 0,
			teamId,
		};
	});
}

function getTeamKey(
	state: Pick<WordGuessState, "mode" | "players" | "currentExplainerId">,
): string {
	if (state.mode === "teams") {
		const explainer = state.players.find((p) => p.id === state.currentExplainerId);
		if (explainer?.teamId) {
			return explainer.teamId;
		}
	}
	return "__all__";
}

function getUsedWords(
	state: Pick<WordGuessState, "wordsUsedByTeam" | "mode" | "players" | "currentExplainerId">,
): string[] {
	return state.wordsUsedByTeam[getTeamKey(state)] ?? [];
}

function addUsedWord(
	wordsUsedByTeam: Record<string, string[]>,
	teamKey: string,
	word: string,
): Record<string, string[]> {
	return {
		...wordsUsedByTeam,
		[teamKey]: [...(wordsUsedByTeam[teamKey] ?? []), word],
	};
}

function nextWord(language: string, difficulty: WordGuessDifficulty, usedWords: string[]): string {
	const diff = difficulty === "all" ? null : difficulty;
	// Try up to 20 times to find an unused word
	for (let i = 0; i < 20; i++) {
		const word = getWord(language, diff);
		if (!usedWords.includes(word)) {
			return word;
		}
	}
	// Fallback: return any word (may repeat)
	return getWord(language, diff);
}

export const wordGuessPlugin: GamePlugin<WordGuessState, WordGuessAction, WordGuessConfig> = {
	id: "word-guess",
	name: "Угадай слово",
	minPlayers: 2,
	maxPlayers: 12,
	defaultConfig: DEFAULT_WORD_GUESS_CONFIG,

	createInitialState(players: PlayerInfo[], config: WordGuessConfig): WordGuessState {
		const merged = { ...DEFAULT_WORD_GUESS_CONFIG, ...config };
		const recommended = getRecommendedSettings(players.length, merged.difficulty);
		// Use recommended values unless explicitly set in config
		if (config.roundTimeSeconds === undefined) {
			merged.roundTimeSeconds = recommended.roundTimeSeconds;
		}
		if (config.cycles === undefined) {
			merged.cycles = recommended.cycles;
		}
		const explainerOrder = buildExplainerOrder(players, merged);
		const firstWord = nextWord(merged.wordLanguage, merged.difficulty, []);

		const teamScores: Record<string, number> | null =
			merged.mode === "teams" && merged.teams
				? Object.fromEntries(Object.keys(merged.teams).map((tid) => [tid, 0]))
				: null;

		// Determine team key for first explainer
		const firstExplainerId = explainerOrder[0]!;
		let firstTeamKey = "__all__";
		if (merged.mode === "teams" && merged.teams) {
			const playerStates = createPlayers(players, merged);
			const explainer = playerStates.find((p) => p.id === firstExplainerId);
			if (explainer?.teamId) {
				firstTeamKey = explainer.teamId;
			}
		}

		return {
			phase: "starting",
			mode: merged.mode,
			currentRound: 1,
			totalRounds: explainerOrder.length,
			explainerOrder,
			currentExplainerId: firstExplainerId,
			currentWord: firstWord,
			wordsUsedByTeam: { [firstTeamKey]: [firstWord] },
			roundResults: [],
			allRoundResults: [],
			players: createPlayers(players, merged),
			teams: merged.mode === "teams" && merged.teams ? merged.teams : null,
			teamScores,
			timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
			roundTimeSeconds: merged.roundTimeSeconds,
			wordLanguage: merged.wordLanguage,
			difficulty: merged.difficulty,
			textMode: merged.textMode ?? false,
		};
	},

	validateAction(state: WordGuessState, action: WordGuessAction, playerId: string): string | null {
		switch (action.type) {
			case "correct": {
				if (state.phase !== "explaining") {
					return "Not in explaining phase";
				}
				if (playerId !== state.currentExplainerId) {
					return "Only the explainer can confirm";
				}
				if (state.mode === "ffa") {
					if (!action.guesserId) {
						return "Must specify who guessed";
					}
					if (action.guesserId === state.currentExplainerId) {
						return "Explainer cannot be the guesser";
					}
					if (!state.players.some((p) => p.id === action.guesserId)) {
						return "Guesser not found";
					}
				}
				return null;
			}
			case "skip": {
				if (state.phase !== "explaining") {
					return "Not in explaining phase";
				}
				if (playerId !== state.currentExplainerId) {
					return "Only the explainer can skip";
				}
				return null;
			}
			case "timerExpired": {
				if (playerId !== "__server__") {
					return "Only server can expire timer";
				}
				if (state.phase !== "explaining") {
					return "Not in explaining phase";
				}
				return null;
			}
			case "nextRound": {
				if (state.phase !== "roundEnd") {
					return "Not in round end phase";
				}
				return null;
			}
			case "guess": {
				if (state.phase !== "explaining") {
					return "Not in explaining phase";
				}
				if (!state.textMode) {
					return "Text mode is not enabled";
				}
				if (playerId === state.currentExplainerId) {
					return "Explainer cannot guess";
				}
				if (!action.word || action.word.trim().length === 0) {
					return "Guess cannot be empty";
				}
				if (state.mode === "teams") {
					const guesser = state.players.find((p) => p.id === playerId);
					const explainer = state.players.find((p) => p.id === state.currentExplainerId);
					if (guesser?.teamId !== explainer?.teamId) {
						return "Can only guess for your own team";
					}
				}
				return null;
			}
			case "beginRound": {
				if (playerId !== "__server__") {
					return "Only server can begin round";
				}
				if (state.phase !== "starting") {
					return "Not in starting phase";
				}
				return null;
			}
			default:
				return "Unknown action";
		}
	},

	reduce(state: WordGuessState, action: WordGuessAction, playerId: string): WordGuessState | null {
		switch (action.type) {
			case "correct": {
				const teamKey = getTeamKey(state);
				const usedWords = getUsedWords(state);
				const word = nextWord(state.wordLanguage, state.difficulty, usedWords);

				// Award points to guesser only
				const players = state.players.map((p) => {
					if (state.mode === "ffa" && p.id === action.guesserId) {
						return { ...p, score: p.score + 1 };
					}
					return p;
				});

				// Update team scores
				let teamScores = state.teamScores;
				if (state.mode === "teams" && teamScores) {
					const explainer = state.players.find((p) => p.id === state.currentExplainerId);
					if (explainer?.teamId) {
						teamScores = {
							...teamScores,
							[explainer.teamId]: (teamScores[explainer.teamId] ?? 0) + 1,
						};
					}
				}

				return {
					...state,
					currentWord: word,
					wordsUsedByTeam: addUsedWord(state.wordsUsedByTeam, teamKey, word),
					roundResults: [
						...state.roundResults,
						{
							word: state.currentWord,
							result: "correct",
							guesserId: action.guesserId ?? null,
						},
					],
					players,
					teamScores,
				};
			}

			case "skip": {
				const teamKey = getTeamKey(state);
				const usedWords = getUsedWords(state);
				const word = nextWord(state.wordLanguage, state.difficulty, usedWords);

				// No penalty for skip

				return {
					...state,
					currentWord: word,
					wordsUsedByTeam: addUsedWord(state.wordsUsedByTeam, teamKey, word),
					roundResults: [
						...state.roundResults,
						{ word: state.currentWord, result: "skipped", guesserId: null },
					],
				};
			}

			case "timerExpired": {
				return {
					...state,
					phase: "roundEnd",
					timerEndsAt: Date.now() + ROUND_END_DELAY_MS,
				};
			}

			case "nextRound": {
				const savedResults = [...state.allRoundResults, state.roundResults];

				if (state.currentRound >= state.totalRounds) {
					return {
						...state,
						phase: "gameOver",
						allRoundResults: savedResults,
					};
				}

				const nextRound = state.currentRound + 1;
				const nextExplainerId = state.explainerOrder[nextRound - 1]!;

				// Determine team key for the next explainer
				let nextTeamKey = "__all__";
				if (state.mode === "teams") {
					const explainer = state.players.find((p) => p.id === nextExplainerId);
					if (explainer?.teamId) {
						nextTeamKey = explainer.teamId;
					}
				}

				const usedWords = state.wordsUsedByTeam[nextTeamKey] ?? [];
				const word = nextWord(state.wordLanguage, state.difficulty, usedWords);

				return {
					...state,
					phase: "starting",
					currentRound: nextRound,
					currentExplainerId: nextExplainerId,
					currentWord: word,
					wordsUsedByTeam: addUsedWord(state.wordsUsedByTeam, nextTeamKey, word),
					roundResults: [],
					allRoundResults: savedResults,
					timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
				};
			}

			case "beginRound": {
				return {
					...state,
					phase: "explaining",
					timerEndsAt: Date.now() + state.roundTimeSeconds * 1000,
				};
			}

			case "guess": {
				if (!wordsMatch(action.word, state.currentWord)) {
					return { ...state };
				}

				const teamKey = getTeamKey(state);
				const usedWords = getUsedWords(state);
				const word = nextWord(state.wordLanguage, state.difficulty, usedWords);

				const players = state.players.map((p) => {
					if (state.mode === "ffa" && p.id === playerId) {
						return { ...p, score: p.score + 1 };
					}
					return p;
				});

				let teamScores = state.teamScores;
				if (state.mode === "teams" && teamScores) {
					const explainer = state.players.find((p) => p.id === state.currentExplainerId);
					if (explainer?.teamId) {
						teamScores = {
							...teamScores,
							[explainer.teamId]: (teamScores[explainer.teamId] ?? 0) + 1,
						};
					}
				}

				return {
					...state,
					currentWord: word,
					wordsUsedByTeam: addUsedWord(state.wordsUsedByTeam, teamKey, word),
					roundResults: [
						...state.roundResults,
						{ word: state.currentWord, result: "correct", guesserId: playerId },
					],
					players,
					teamScores,
				};
			}

			default:
				return null;
		}
	},

	getPlayerView(state: WordGuessState, playerId: string): WordGuessPlayerView {
		const isExplainer = playerId === state.currentExplainerId;

		const showWord = state.phase === "explaining" ? isExplainer : false;

		const correctCount = state.roundResults.filter((r) => r.result === "correct").length;
		const skipCount = state.roundResults.filter((r) => r.result === "skipped").length;

		return {
			phase: state.phase,
			mode: state.mode,
			currentRound: state.currentRound,
			totalRounds: state.totalRounds,
			currentExplainerId: state.currentExplainerId,
			isExplainer,
			currentWord: showWord ? state.currentWord : null,
			players: state.players,
			teams: state.teams,
			teamScores: state.teamScores,
			timerEndsAt: state.timerEndsAt,
			roundResults: state.roundResults,
			roundCorrectCount: correctCount,
			roundSkipCount: skipCount,
			textMode: state.textMode,
		};
	},

	getSpectatorView(state: WordGuessState): WordGuessPlayerView {
		const correctCount = state.roundResults.filter((r) => r.result === "correct").length;
		const skipCount = state.roundResults.filter((r) => r.result === "skipped").length;

		return {
			phase: state.phase,
			mode: state.mode,
			currentRound: state.currentRound,
			totalRounds: state.totalRounds,
			currentExplainerId: state.currentExplainerId,
			isExplainer: false,
			currentWord: state.currentWord,
			players: state.players,
			teams: state.teams,
			teamScores: state.teamScores,
			timerEndsAt: state.timerEndsAt,
			roundResults: state.roundResults,
			roundCorrectCount: correctCount,
			roundSkipCount: skipCount,
			textMode: state.textMode,
		};
	},

	getServerActions(): WordGuessAction[] {
		return [];
	},

	isGameOver(state: WordGuessState): boolean {
		return state.phase === "gameOver";
	},

	shouldPauseOnDisconnect(): boolean {
		return true;
	},

	getTimerConfig(state: WordGuessState): TimerConfig | null {
		if (state.phase === "starting") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `starting-${state.currentRound}`,
					durationMs: delay,
					action: { type: "beginRound" },
				};
			}
		}
		if (state.phase === "explaining") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `explaining-${state.currentRound}`,
					durationMs: delay,
					action: { type: "timerExpired" },
				};
			}
		}
		if (state.phase === "roundEnd") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `roundEnd-${state.currentRound}`,
					durationMs: delay,
					action: { type: "nextRound" },
				};
			}
		}
		return null;
	},
};
