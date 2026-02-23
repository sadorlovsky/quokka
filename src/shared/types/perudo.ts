import type { BaseGameAction } from "./game";

// --- Phases ---

export type PerudoPhase =
	| "starting" // Pre-round countdown (3s)
	| "bidding" // Active bidding phase — players take turns
	| "reveal" // All dice revealed after dudo call (5s auto-advance)
	| "roundEnd" // Show who lost a die (3s auto-advance)
	| "gameOver"; // Final standings

// --- Constants ---

export const PERUDO_STARTING_DICE = 5;
export const PERUDO_REVEAL_DELAY_MS = 5_000;

// --- Config ---

export interface PerudoConfig {
	palifico: boolean;
	turnTimeSeconds: number;
}

export const DEFAULT_PERUDO_CONFIG: PerudoConfig = {
	palifico: true,
	turnTimeSeconds: 60,
};

// --- Bid ---

export interface PerudoBid {
	playerId: string;
	quantity: number;
	faceValue: number; // 1-6
}

// --- Player State ---

export interface PerudoPlayerState {
	id: string;
	name: string;
	avatarSeed: number;
	diceCount: number;
	dice: number[];
	isEliminated: boolean;
}

// --- Server-side Full State ---

export interface PerudoState {
	phase: PerudoPhase;

	players: PerudoPlayerState[];
	seatOrder: string[]; // original seating order (never changes)
	turnOrder: string[]; // active (non-eliminated) player IDs in seat order
	currentPlayerIndex: number; // index into turnOrder
	currentPlayerId: string;

	round: number;
	isPalificoRound: boolean;
	palificoPlayerId: string | null;
	palificoFaceValueLocked: boolean;

	currentBid: PerudoBid | null;
	bidHistory: PerudoBid[];

	challengerId: string | null;
	challengedBid: PerudoBid | null;
	actualCount: number;
	challengeLoser: string | null;

	roundStarterId: string;

	timerEndsAt: number;
	turnTimeMs: number;
	palificoEnabled: boolean;

	winnerId: string | null;
}

// --- Player View ---

export interface PerudoPlayerViewPlayer {
	id: string;
	name: string;
	avatarSeed: number;
	diceCount: number;
	isEliminated: boolean;
	dice: number[] | null; // only own dice or during reveal
}

export interface PerudoPlayerView {
	phase: PerudoPhase;

	players: PerudoPlayerViewPlayer[];
	turnOrder: string[];
	currentPlayerId: string;
	isMyTurn: boolean;

	round: number;
	isPalificoRound: boolean;
	palificoPlayerId: string | null;

	currentBid: PerudoBid | null;
	bidHistory: PerudoBid[];

	myDice: number[];
	myDiceCount: number;

	challengerId: string | null;
	challengedBid: PerudoBid | null;
	actualCount: number | null;
	challengeLoser: string | null;

	timerEndsAt: number;
	winnerId: string | null;
	totalDiceInPlay: number;
}

// --- Actions ---

export interface PerudoStartRoundAction extends BaseGameAction {
	type: "startRound";
}

export interface PerudoBidAction extends BaseGameAction {
	type: "bid";
	quantity: number;
	faceValue: number;
}

export interface PerudoDudoAction extends BaseGameAction {
	type: "dudo";
}

export interface PerudoRevealDoneAction extends BaseGameAction {
	type: "revealDone";
}

export interface PerudoNextRoundAction extends BaseGameAction {
	type: "nextRound";
}

export interface PerudoTurnTimeoutAction extends BaseGameAction {
	type: "turnTimeout";
}

export type PerudoAction =
	| PerudoStartRoundAction
	| PerudoBidAction
	| PerudoDudoAction
	| PerudoRevealDoneAction
	| PerudoNextRoundAction
	| PerudoTurnTimeoutAction;
