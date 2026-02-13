import type { BaseGameAction } from "./game";

// --- Phases ---

export type HangmanPhase =
	| "starting" // Pre-round countdown (3s), announces executioner
	| "pickingWord" // Executioner types a custom word
	| "guessing" // Guessers take turns (30s per turn)
	| "roundEnd" // Show results, reveal word (10s auto-advance)
	| "gameOver"; // Final scoreboard

// --- Constants ---

export const HANGMAN_TURN_TIMER_MS = 30_000; // 30s per guesser turn
export const HANGMAN_MAX_ERRORS = 6;

// --- Config ---

export type HangmanConfig = Record<string, never>;

export const DEFAULT_HANGMAN_CONFIG: HangmanConfig = {} as HangmanConfig;

// --- Player State ---

export interface HangmanPlayerState {
	id: string;
	name: string;
	avatarSeed: number;
	score: number;
}

// --- Server-side Full State ---

export interface HangmanState {
	phase: HangmanPhase;

	currentRound: number;
	totalRounds: number;

	// Executioner rotation
	executionerOrder: string[]; // playerIds in rotation order (length = totalRounds)
	currentExecutionerId: string;

	// Turn management (guessers only)
	guesserOrder: string[]; // all playerIds except current executioner
	currentGuesserIndex: number;
	eliminatedGuessers: string[]; // eliminated this round (wrong word guess)

	// Word state
	currentWord: string; // executioner's chosen word (lowercase)
	guessedLetters: string[];
	wrongLetters: string[];
	maxErrors: number;

	// Tracking
	letterGuessedBy: Record<string, string>; // letter -> playerId
	wordGuessedBy: string | null; // playerId who guessed the full word

	players: HangmanPlayerState[];

	timerEndsAt: number;

	roundEndReason: "wordGuessed" | "hangmanComplete" | null;
}

// --- Player View (personalized per player) ---

export interface HangmanPlayerView {
	phase: HangmanPhase;

	currentRound: number;
	totalRounds: number;

	currentExecutionerId: string;
	isExecutioner: boolean;

	// Turn info
	guesserOrder: string[];
	currentGuesserId: string | null;
	isMyTurn: boolean;
	eliminatedGuessers: string[];

	// Word display
	maskedWord: string;
	wordLength: number;
	guessedLetters: string[];
	wrongLetters: string[];
	wrongCount: number;
	maxErrors: number;

	// Who guessed what (letter -> playerName)
	letterGuessedBy: Record<string, string>;
	wordGuessedBy: string | null; // playerName on roundEnd

	// Full word — executioner sees always during guessing; everyone on roundEnd/gameOver
	currentWord: string | null;

	players: HangmanPlayerState[];

	timerEndsAt: number;

	roundEndReason: "wordGuessed" | "hangmanComplete" | null;
}

// --- Actions ---

export interface HangmanBeginRoundAction extends BaseGameAction {
	type: "beginRound";
}

export interface HangmanSubmitWordAction extends BaseGameAction {
	type: "submitWord";
	word: string;
}

export interface HangmanGuessLetterAction extends BaseGameAction {
	type: "guessLetter";
	letter: string;
}

export interface HangmanGuessWordAction extends BaseGameAction {
	type: "guessWord";
	word: string;
}

export interface HangmanTurnTimeoutAction extends BaseGameAction {
	type: "turnTimeout";
}

export interface HangmanNextRoundAction extends BaseGameAction {
	type: "nextRound";
}

export type HangmanAction =
	| HangmanBeginRoundAction
	| HangmanSubmitWordAction
	| HangmanGuessLetterAction
	| HangmanGuessWordAction
	| HangmanTurnTimeoutAction
	| HangmanNextRoundAction;
