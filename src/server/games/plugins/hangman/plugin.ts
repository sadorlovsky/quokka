import { ROUND_END_DELAY_MS, ROUND_START_COUNTDOWN_MS } from "@/shared/constants";
import type { GamePlugin, TimerConfig } from "@/shared/types/game";
import type {
	HangmanAction,
	HangmanConfig,
	HangmanPlayerView,
	HangmanState,
} from "@/shared/types/hangman";
import {
	DEFAULT_HANGMAN_CONFIG,
	HANGMAN_MAX_ERRORS,
	HANGMAN_TURN_TIMER_MS,
	HANGMAN_WORD_PICK_TIMER_MS,
} from "@/shared/types/hangman";
import type { PlayerInfo } from "@/shared/types/room";

const WORD_REGEX = /^[а-яё]{3,15}$/i;
const FALLBACK_WORDS = ["кот", "дом", "лес", "мост", "чай", "хлеб", "стол", "луна", "берег", "сад"];

// --- Helpers ---

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j]!, a[i]!];
	}
	return a;
}

function maskWord(word: string, guessedLetters: string[]): string {
	return word
		.split("")
		.map((ch) => (guessedLetters.includes(ch.toLowerCase()) ? ch : "_"))
		.join(" ");
}

function isWordFullyGuessed(word: string, guessedLetters: string[]): boolean {
	return word.split("").every((ch) => guessedLetters.includes(ch.toLowerCase()));
}

function countOccurrences(word: string, letter: string): number {
	return word.split("").filter((ch) => ch.toLowerCase() === letter).length;
}

function getFallbackWord(): string {
	return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]!;
}

function buildGuesserOrder(players: { id: string }[], executionerId: string): string[] {
	return players.filter((p) => p.id !== executionerId).map((p) => p.id);
}

function advanceGuesserIndex(state: HangmanState): number {
	const n = state.guesserOrder.length;
	let next = (state.currentGuesserIndex + 1) % n;
	let checked = 0;
	while (state.eliminatedGuessers.includes(state.guesserOrder[next]!) && checked < n) {
		next = (next + 1) % n;
		checked++;
	}
	return next;
}

function allGuessersEliminated(state: HangmanState): boolean {
	return state.guesserOrder.every((id) => state.eliminatedGuessers.includes(id));
}

function updatePlayerScore(
	players: HangmanState["players"],
	playerId: string,
	delta: number,
): HangmanState["players"] {
	return players.map((p) => (p.id === playerId ? { ...p, score: p.score + delta } : p));
}

function mapLetterGuessedBy(state: HangmanState): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [letter, pid] of Object.entries(state.letterGuessedBy)) {
		const player = state.players.find((p) => p.id === pid);
		if (player) {
			result[letter] = player.name;
		}
	}
	return result;
}

function buildPlayerView(state: HangmanState, playerId: string): HangmanPlayerView {
	const isExecutioner = playerId === state.currentExecutionerId;
	const showWord = isExecutioner || state.phase === "roundEnd" || state.phase === "gameOver";

	const currentGuesserId =
		state.phase === "guessing" ? (state.guesserOrder[state.currentGuesserIndex] ?? null) : null;

	const wordGuessedByName = state.wordGuessedBy
		? (state.players.find((p) => p.id === state.wordGuessedBy)?.name ?? null)
		: null;

	return {
		phase: state.phase,
		currentRound: state.currentRound,
		totalRounds: state.totalRounds,
		currentExecutionerId: state.currentExecutionerId,
		isExecutioner,
		guesserOrder: state.guesserOrder,
		currentGuesserId,
		isMyTurn: state.phase === "guessing" && currentGuesserId === playerId,
		eliminatedGuessers: state.eliminatedGuessers,
		maskedWord: state.currentWord ? maskWord(state.currentWord, state.guessedLetters) : "",
		wordLength: state.currentWord ? state.currentWord.length : 0,
		guessedLetters: state.guessedLetters,
		wrongLetters: state.wrongLetters,
		wrongCount: state.wrongLetters.length,
		maxErrors: state.maxErrors,
		letterGuessedBy: mapLetterGuessedBy(state),
		wordGuessedBy: wordGuessedByName,
		currentWord: showWord ? state.currentWord : null,
		players: state.players,
		timerEndsAt: state.timerEndsAt,
		roundEndReason: state.roundEndReason,
	};
}

// --- Reduce helpers for round ending ---

function endRound(state: HangmanState, reason: "wordGuessed" | "hangmanComplete"): HangmanState {
	let players = state.players;

	// Executioner bonus for hangman complete
	if (reason === "hangmanComplete") {
		players = updatePlayerScore(players, state.currentExecutionerId, 3);
	}

	return {
		...state,
		phase: "roundEnd",
		players,
		roundEndReason: reason,
		timerEndsAt: Date.now() + ROUND_END_DELAY_MS,
	};
}

function handleWrongGuess(
	state: HangmanState,
	guesserId: string,
	guesserPenalty: number,
): HangmanState {
	let players = updatePlayerScore(state.players, guesserId, guesserPenalty);
	players = updatePlayerScore(players, state.currentExecutionerId, 1);

	const newWrongCount = state.wrongLetters.length + 1;

	if (newWrongCount >= state.maxErrors || allGuessersEliminated(state)) {
		return endRound({ ...state, players }, "hangmanComplete");
	}

	const nextIndex = advanceGuesserIndex(state);

	return {
		...state,
		players,
		currentGuesserIndex: nextIndex,
		timerEndsAt: Date.now() + HANGMAN_TURN_TIMER_MS,
	};
}

// --- Plugin ---

export const hangmanPlugin: GamePlugin<HangmanState, HangmanAction, HangmanConfig> = {
	id: "hangman",
	name: "Виселица",
	minPlayers: 2,
	maxPlayers: 12,
	defaultConfig: DEFAULT_HANGMAN_CONFIG,

	createInitialState(players: PlayerInfo[], _config: HangmanConfig): HangmanState {
		const ids = players.map((p) => p.id);
		const shuffled = shuffle(ids);
		// Each player is executioner exactly twice
		const executionerOrder = [...shuffled, ...shuffled];
		const totalRounds = executionerOrder.length;
		const firstExecutioner = executionerOrder[0]!;

		return {
			phase: "starting",
			currentRound: 1,
			totalRounds,
			executionerOrder,
			currentExecutionerId: firstExecutioner,
			guesserOrder: buildGuesserOrder(players, firstExecutioner),
			currentGuesserIndex: 0,
			eliminatedGuessers: [],
			currentWord: "",
			guessedLetters: [],
			wrongLetters: [],
			maxErrors: HANGMAN_MAX_ERRORS,
			letterGuessedBy: {},
			wordGuessedBy: null,
			players: players.map((p) => ({
				id: p.id,
				name: p.name,
				avatarSeed: p.avatarSeed,
				score: 0,
			})),
			timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
			roundEndReason: null,
		};
	},

	validateAction(state: HangmanState, action: HangmanAction, playerId: string): string | null {
		switch (action.type) {
			case "beginRound": {
				if (playerId !== "__server__") {
					return "Only server can begin round";
				}
				if (state.phase !== "starting") {
					return "Not in starting phase";
				}
				return null;
			}
			case "submitWord": {
				if (state.phase !== "pickingWord") {
					return "Not in word picking phase";
				}
				if (playerId !== state.currentExecutionerId) {
					return "Only executioner can submit word";
				}
				if (!WORD_REGEX.test(action.word)) {
					return "Word must be 3-15 Cyrillic letters";
				}
				return null;
			}
			case "guessLetter": {
				if (state.phase !== "guessing") {
					return "Not in guessing phase";
				}
				const currentGuesserId = state.guesserOrder[state.currentGuesserIndex];
				if (playerId !== currentGuesserId) {
					return "Not your turn";
				}
				const letter = action.letter.toLowerCase();
				if (letter.length !== 1 || !/^[а-яё]$/.test(letter)) {
					return "Must be a single Cyrillic letter";
				}
				if (state.guessedLetters.includes(letter) || state.wrongLetters.includes(letter)) {
					return "Letter already used";
				}
				return null;
			}
			case "guessWord": {
				if (state.phase !== "guessing") {
					return "Not in guessing phase";
				}
				const currentGuesser = state.guesserOrder[state.currentGuesserIndex];
				if (playerId !== currentGuesser) {
					return "Not your turn";
				}
				if (!action.word || action.word.trim().length === 0) {
					return "Word cannot be empty";
				}
				return null;
			}
			case "turnTimeout": {
				if (playerId !== "__server__") {
					return "Only server can timeout";
				}
				if (state.phase !== "guessing") {
					return "Not in guessing phase";
				}
				return null;
			}
			case "wordPickTimeout": {
				if (playerId !== "__server__") {
					return "Only server can timeout";
				}
				if (state.phase !== "pickingWord") {
					return "Not in word picking phase";
				}
				return null;
			}
			case "nextRound": {
				if (playerId !== "__server__") {
					return "Only server can advance round";
				}
				if (state.phase !== "roundEnd") {
					return "Not in round end phase";
				}
				return null;
			}
			default:
				return "Unknown action";
		}
	},

	reduce(state: HangmanState, action: HangmanAction, playerId: string): HangmanState | null {
		switch (action.type) {
			case "beginRound": {
				return {
					...state,
					phase: "pickingWord",
					timerEndsAt: Date.now() + HANGMAN_WORD_PICK_TIMER_MS,
				};
			}

			case "submitWord": {
				const word = action.word.toLowerCase();
				return {
					...state,
					phase: "guessing",
					currentWord: word,
					currentGuesserIndex: 0,
					timerEndsAt: Date.now() + HANGMAN_TURN_TIMER_MS,
				};
			}

			case "wordPickTimeout": {
				const word = getFallbackWord();
				return {
					...state,
					phase: "guessing",
					currentWord: word,
					currentGuesserIndex: 0,
					timerEndsAt: Date.now() + HANGMAN_TURN_TIMER_MS,
				};
			}

			case "guessLetter": {
				const letter = action.letter.toLowerCase();
				const isCorrect = state.currentWord.includes(letter);

				if (isCorrect) {
					const newGuessed = [...state.guessedLetters, letter];
					const occurrences = countOccurrences(state.currentWord, letter);
					const players = updatePlayerScore(state.players, playerId, occurrences);
					const newLetterGuessedBy = {
						...state.letterGuessedBy,
						[letter]: playerId,
					};

					if (isWordFullyGuessed(state.currentWord, newGuessed)) {
						return endRound(
							{
								...state,
								guessedLetters: newGuessed,
								letterGuessedBy: newLetterGuessedBy,
								players,
							},
							"wordGuessed",
						);
					}

					// Correct: same player keeps turn, timer resets
					return {
						...state,
						guessedLetters: newGuessed,
						letterGuessedBy: newLetterGuessedBy,
						players,
						timerEndsAt: Date.now() + HANGMAN_TURN_TIMER_MS,
					};
				}

				// Wrong letter
				const newWrong = [...state.wrongLetters, letter];
				return handleWrongGuess({ ...state, wrongLetters: newWrong }, playerId, -1);
			}

			case "guessWord": {
				const guess = action.word.toLowerCase().trim();
				const isCorrect = guess === state.currentWord;

				if (isCorrect) {
					// Fill all letters as guessed
					const allLetters = [...new Set(state.currentWord.split(""))];
					const players = updatePlayerScore(state.players, playerId, 3);
					return endRound(
						{
							...state,
							guessedLetters: allLetters,
							wordGuessedBy: playerId,
							players,
						},
						"wordGuessed",
					);
				}

				// Wrong word: eliminate guesser, hangman grows
				const newEliminated = [...state.eliminatedGuessers, playerId];
				const newWrong = [...state.wrongLetters, `[${guess}]`]; // track as pseudo-entry for wrongCount

				const stateWithElimination = {
					...state,
					eliminatedGuessers: newEliminated,
					wrongLetters: newWrong,
				};

				if (newWrong.length >= state.maxErrors || allGuessersEliminated(stateWithElimination)) {
					let players = updatePlayerScore(state.players, playerId, -2);
					players = updatePlayerScore(players, state.currentExecutionerId, 1);
					return endRound({ ...stateWithElimination, players }, "hangmanComplete");
				}

				let players = updatePlayerScore(state.players, playerId, -2);
				players = updatePlayerScore(players, state.currentExecutionerId, 1);
				const nextIndex = advanceGuesserIndex(stateWithElimination);

				return {
					...stateWithElimination,
					players,
					currentGuesserIndex: nextIndex,
					timerEndsAt: Date.now() + HANGMAN_TURN_TIMER_MS,
				};
			}

			case "turnTimeout": {
				const guesserId = state.guesserOrder[state.currentGuesserIndex]!;
				const newWrong = [...state.wrongLetters, `[timeout-${state.currentGuesserIndex}]`];
				return handleWrongGuess({ ...state, wrongLetters: newWrong }, guesserId, -1);
			}

			case "nextRound": {
				if (state.currentRound >= state.totalRounds) {
					return { ...state, phase: "gameOver" };
				}

				const nextRound = state.currentRound + 1;
				const nextExecutioner = state.executionerOrder[nextRound - 1]!;

				return {
					...state,
					phase: "starting",
					currentRound: nextRound,
					currentExecutionerId: nextExecutioner,
					guesserOrder: buildGuesserOrder(state.players, nextExecutioner),
					currentGuesserIndex: 0,
					eliminatedGuessers: [],
					currentWord: "",
					guessedLetters: [],
					wrongLetters: [],
					letterGuessedBy: {},
					wordGuessedBy: null,
					roundEndReason: null,
					timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
				};
			}

			default:
				return null;
		}
	},

	getPlayerView(state: HangmanState, playerId: string): HangmanPlayerView {
		return buildPlayerView(state, playerId);
	},

	getSpectatorView(state: HangmanState): HangmanPlayerView {
		const currentGuesserId =
			state.phase === "guessing" ? (state.guesserOrder[state.currentGuesserIndex] ?? null) : null;

		return {
			phase: state.phase,
			currentRound: state.currentRound,
			totalRounds: state.totalRounds,
			currentExecutionerId: state.currentExecutionerId,
			isExecutioner: false,
			guesserOrder: state.guesserOrder,
			currentGuesserId,
			isMyTurn: false,
			eliminatedGuessers: state.eliminatedGuessers,
			maskedWord: state.currentWord ? maskWord(state.currentWord, state.guessedLetters) : "",
			wordLength: state.currentWord ? state.currentWord.length : 0,
			guessedLetters: state.guessedLetters,
			wrongLetters: state.wrongLetters,
			wrongCount: state.wrongLetters.length,
			maxErrors: state.maxErrors,
			letterGuessedBy: mapLetterGuessedBy(state),
			wordGuessedBy: state.wordGuessedBy
				? (state.players.find((p) => p.id === state.wordGuessedBy)?.name ?? null)
				: null,
			currentWord: state.currentWord || null,
			players: state.players,
			timerEndsAt: state.timerEndsAt,
			roundEndReason: state.roundEndReason,
		};
	},

	getServerActions(): HangmanAction[] {
		return [];
	},

	isGameOver(state: HangmanState): boolean {
		return state.phase === "gameOver";
	},

	shouldPauseOnDisconnect(): boolean {
		return true;
	},

	getTimerConfig(state: HangmanState): TimerConfig | null {
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
		if (state.phase === "guessing") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					// Include guessedLetters length so correct guess resets timer
					key: `turn-${state.currentRound}-${state.currentGuesserIndex}-${state.guessedLetters.length}`,
					durationMs: delay,
					action: { type: "turnTimeout" },
				};
			}
		}
		if (state.phase === "pickingWord") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `pick-${state.currentRound}-${state.currentExecutionerId}`,
					durationMs: delay,
					action: { type: "wordPickTimeout" },
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
