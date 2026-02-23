import { ROUND_END_DELAY_MS, ROUND_START_COUNTDOWN_MS } from "@/shared/constants";
import type { GamePlugin, TimerConfig } from "@/shared/types/game";
import type {
	PerudoAction,
	PerudoBid,
	PerudoConfig,
	PerudoPlayerView,
	PerudoState,
} from "@/shared/types/perudo";
import {
	DEFAULT_PERUDO_CONFIG,
	PERUDO_REVEAL_DELAY_MS,
	PERUDO_STARTING_DICE,
} from "@/shared/types/perudo";
import type { PlayerInfo } from "@/shared/types/room";

// --- Helpers ---

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j]!, a[i]!];
	}
	return a;
}

function rollDice(count: number): number[] {
	const dice: number[] = [];
	for (let i = 0; i < count; i++) {
		dice.push(Math.floor(Math.random() * 6) + 1);
	}
	return dice;
}

function countMatchingDice(state: PerudoState, faceValue: number): number {
	let count = 0;
	for (const player of state.players) {
		if (player.isEliminated) {
			continue;
		}
		for (const die of player.dice) {
			if (die === faceValue) {
				count++;
			} else if (!state.isPalificoRound && faceValue !== 1 && die === 1) {
				// 1s are wild in normal rounds (unless bidding on 1s)
				count++;
			}
		}
	}
	return count;
}

function buildTurnOrder(seatOrder: string[], eliminatedIds: Set<string>): string[] {
	return seatOrder.filter((id) => !eliminatedIds.has(id));
}

function getEliminatedIds(players: PerudoState["players"]): Set<string> {
	return new Set(players.filter((p) => p.isEliminated).map((p) => p.id));
}

function getNextPlayerIndex(turnOrder: string[], currentIndex: number): number {
	return (currentIndex + 1) % turnOrder.length;
}

function findPlayerIndex(turnOrder: string[], playerId: string): number {
	const idx = turnOrder.indexOf(playerId);
	return idx >= 0 ? idx : 0;
}

/**
 * Validate a bid according to Perudo rules.
 *
 * Normal round:
 * - If current bid is on face F (not 1): raise quantity (any face 2-6), OR same quantity + higher face, OR switch to 1s with qty >= ceil(current/2)
 * - If current bid is on 1s: raise quantity of 1s, OR switch to non-1 face with qty >= current*2+1
 *
 * Palifico round:
 * - First bid: any valid bid
 * - After first bid: only quantity can change (face value locked), unless someone raises face value (then lock is released)
 */
function isValidBid(
	currentBid: PerudoBid | null,
	newQuantity: number,
	newFaceValue: number,
	isPalifico: boolean,
	palificoFaceValueLocked: boolean,
): boolean {
	if (newQuantity < 1 || newFaceValue < 1 || newFaceValue > 6) {
		return false;
	}

	// First bid of the round — anything valid
	if (!currentBid) {
		return true;
	}

	if (isPalifico && palificoFaceValueLocked) {
		// In palifico with locked face: must use same face, higher quantity
		// OR raise the face value (which unlocks it)
		if (newFaceValue === currentBid.faceValue) {
			return newQuantity > currentBid.quantity;
		}
		// Raising face value — allowed, any quantity >= current
		if (newFaceValue > currentBid.faceValue) {
			return newQuantity >= currentBid.quantity;
		}
		return false;
	}

	if (isPalifico) {
		// Palifico but not yet locked (shouldn't happen — lock activates on first bid)
		// Treat as normal
	}

	// Normal bid rules (or palifico after lock released)
	if (currentBid.faceValue === 1) {
		// Current bid is on 1s
		if (newFaceValue === 1) {
			// Stay on 1s — must increase quantity
			return newQuantity > currentBid.quantity;
		}
		// Switch from 1s to another face — quantity must be >= currentQty*2+1
		return newQuantity >= currentBid.quantity * 2 + 1;
	}

	// Current bid is on non-1 face
	if (newFaceValue === 1) {
		// Switch to 1s — quantity must be >= ceil(currentQty/2)
		return newQuantity >= Math.ceil(currentBid.quantity / 2);
	}

	// Both non-1: raise quantity or same qty + higher face
	if (newQuantity > currentBid.quantity) {
		return true;
	}
	if (newQuantity === currentBid.quantity && newFaceValue > currentBid.faceValue) {
		return true;
	}
	return false;
}

function rollAllDice(state: PerudoState): PerudoState {
	return {
		...state,
		players: state.players.map((p) => (p.isEliminated ? p : { ...p, dice: rollDice(p.diceCount) })),
	};
}

function totalDiceInPlay(players: PerudoState["players"]): number {
	return players.reduce((sum, p) => sum + (p.isEliminated ? 0 : p.diceCount), 0);
}

function buildPlayerView(state: PerudoState, playerId: string): PerudoPlayerView {
	const isReveal =
		state.phase === "reveal" || state.phase === "roundEnd" || state.phase === "gameOver";
	const me = state.players.find((p) => p.id === playerId);

	return {
		phase: state.phase,
		players: state.players.map((p) => ({
			id: p.id,
			name: p.name,
			avatarSeed: p.avatarSeed,
			diceCount: p.diceCount,
			isEliminated: p.isEliminated,
			dice: p.id === playerId || isReveal ? p.dice : null,
		})),
		turnOrder: state.turnOrder,
		currentPlayerId: state.currentPlayerId,
		isMyTurn: state.phase === "bidding" && state.currentPlayerId === playerId,
		round: state.round,
		isPalificoRound: state.isPalificoRound,
		palificoPlayerId: state.isPalificoRound ? state.palificoPlayerId : null,
		currentBid: state.currentBid,
		bidHistory: state.bidHistory,
		myDice: me?.dice ?? [],
		myDiceCount: me?.diceCount ?? 0,
		challengerId: isReveal ? state.challengerId : null,
		challengedBid: isReveal ? state.challengedBid : null,
		actualCount: isReveal ? state.actualCount : null,
		challengeLoser: isReveal ? state.challengeLoser : null,
		timerEndsAt: state.timerEndsAt,
		winnerId: state.winnerId,
		totalDiceInPlay: totalDiceInPlay(state.players),
	};
}

// --- Plugin ---

export const perudoPlugin: GamePlugin<PerudoState, PerudoAction, PerudoConfig> = {
	id: "perudo",
	name: "Перудо",
	minPlayers: 2,
	maxPlayers: 6,
	defaultConfig: DEFAULT_PERUDO_CONFIG,

	createInitialState(players: PlayerInfo[], config: PerudoConfig): PerudoState {
		const shuffled = shuffle(players);
		const seatOrder = shuffled.map((p) => p.id);
		const firstPlayer = seatOrder[0]!;

		const turnTimeMs = config.turnTimeSeconds * 1000;

		return {
			phase: "starting",
			players: shuffled.map((p) => ({
				id: p.id,
				name: p.name,
				avatarSeed: p.avatarSeed,
				diceCount: PERUDO_STARTING_DICE,
				dice: rollDice(PERUDO_STARTING_DICE),
				isEliminated: false,
			})),
			seatOrder,
			turnOrder: [...seatOrder],
			currentPlayerIndex: 0,
			currentPlayerId: firstPlayer,
			round: 1,
			isPalificoRound: false,
			palificoPlayerId: null,
			palificoFaceValueLocked: false,
			currentBid: null,
			bidHistory: [],
			challengerId: null,
			challengedBid: null,
			actualCount: 0,
			challengeLoser: null,
			roundStarterId: firstPlayer,
			timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
			turnTimeMs,
			palificoEnabled: config.palifico,
			winnerId: null,
		};
	},

	validateAction(state: PerudoState, action: PerudoAction, playerId: string): string | null {
		switch (action.type) {
			case "startRound": {
				if (playerId !== "__server__") {
					return "Only server can start round";
				}
				if (state.phase !== "starting") {
					return "Not in starting phase";
				}
				return null;
			}
			case "bid": {
				if (state.phase !== "bidding") {
					return "Not in bidding phase";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}
				if (
					!isValidBid(
						state.currentBid,
						action.quantity,
						action.faceValue,
						state.isPalificoRound,
						state.palificoFaceValueLocked,
					)
				) {
					return "Invalid bid";
				}
				return null;
			}
			case "dudo": {
				if (state.phase !== "bidding") {
					return "Not in bidding phase";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}
				if (!state.currentBid) {
					return "No bid to challenge";
				}
				return null;
			}
			case "turnTimeout": {
				if (playerId !== "__server__") {
					return "Only server can timeout";
				}
				if (state.phase !== "bidding") {
					return "Not in bidding phase";
				}
				return null;
			}
			case "revealDone": {
				if (playerId !== "__server__") {
					return "Only server can advance";
				}
				if (state.phase !== "reveal") {
					return "Not in reveal phase";
				}
				return null;
			}
			case "nextRound": {
				if (playerId !== "__server__") {
					return "Only server can advance";
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

	reduce(state: PerudoState, action: PerudoAction, _playerId: string): PerudoState | null {
		switch (action.type) {
			case "startRound": {
				const rolled = rollAllDice(state);
				// Check palifico: round starter has exactly 1 die
				const starter = rolled.players.find((p) => p.id === state.roundStarterId);
				const isPalifico = !!starter && starter.diceCount === 1 && !starter.isEliminated;

				return {
					...rolled,
					phase: "bidding",
					currentBid: null,
					bidHistory: [],
					challengerId: null,
					challengedBid: null,
					actualCount: 0,
					challengeLoser: null,
					isPalificoRound: isPalifico && state.palificoEnabled,
					palificoPlayerId: isPalifico && state.palificoEnabled ? state.roundStarterId : null,
					palificoFaceValueLocked: false,
					timerEndsAt: Date.now() + state.turnTimeMs,
				};
			}

			case "bid": {
				const bid: PerudoBid = {
					playerId: state.currentPlayerId,
					quantity: action.quantity,
					faceValue: action.faceValue,
				};
				const nextIndex = getNextPlayerIndex(state.turnOrder, state.currentPlayerIndex);

				// Palifico face value locking
				let palificoLocked = state.palificoFaceValueLocked;
				if (state.isPalificoRound) {
					if (!state.currentBid) {
						// First bid — lock the face value
						palificoLocked = true;
					} else if (action.faceValue !== state.currentBid.faceValue) {
						// Face value changed — unlock
						palificoLocked = false;
					}
				}

				return {
					...state,
					currentBid: bid,
					bidHistory: [...state.bidHistory, bid],
					currentPlayerIndex: nextIndex,
					currentPlayerId: state.turnOrder[nextIndex]!,
					palificoFaceValueLocked: palificoLocked,
					timerEndsAt: Date.now() + state.turnTimeMs,
				};
			}

			case "dudo": {
				const challengerId = state.currentPlayerId;
				const challengedBid = state.currentBid!;
				const actualCount = countMatchingDice(state, challengedBid.faceValue);

				// If actualCount >= bid quantity, bidder was right → challenger loses
				// If actualCount < bid quantity, bidder was wrong → bidder loses
				const bidderWasRight = actualCount >= challengedBid.quantity;
				const loserId = bidderWasRight ? challengerId : challengedBid.playerId;

				const players = state.players.map((p) => {
					if (p.id !== loserId) {
						return p;
					}
					const newCount = p.diceCount - 1;
					return {
						...p,
						diceCount: newCount,
						dice: p.dice.slice(0, newCount),
						isEliminated: newCount === 0,
					};
				});

				return {
					...state,
					phase: "reveal",
					players,
					challengerId,
					challengedBid,
					actualCount,
					challengeLoser: loserId,
					timerEndsAt: Date.now() + PERUDO_REVEAL_DELAY_MS,
				};
			}

			case "turnTimeout": {
				if (!state.currentBid) {
					// First bidder timed out — auto-bid 1x2 (lowest valid bid)
					const bid: PerudoBid = {
						playerId: state.currentPlayerId,
						quantity: 1,
						faceValue: 2,
					};
					const nextIndex = getNextPlayerIndex(state.turnOrder, state.currentPlayerIndex);

					return {
						...state,
						currentBid: bid,
						bidHistory: [...state.bidHistory, bid],
						currentPlayerIndex: nextIndex,
						currentPlayerId: state.turnOrder[nextIndex]!,
						timerEndsAt: Date.now() + state.turnTimeMs,
					};
				}

				// Auto-dudo
				const challengerId = state.currentPlayerId;
				const challengedBid = state.currentBid;
				const actualCount = countMatchingDice(state, challengedBid.faceValue);
				const bidderWasRight = actualCount >= challengedBid.quantity;
				const loserId = bidderWasRight ? challengerId : challengedBid.playerId;

				const players = state.players.map((p) => {
					if (p.id !== loserId) {
						return p;
					}
					const newCount = p.diceCount - 1;
					return {
						...p,
						diceCount: newCount,
						dice: p.dice.slice(0, newCount),
						isEliminated: newCount === 0,
					};
				});

				return {
					...state,
					phase: "reveal",
					players,
					challengerId,
					challengedBid,
					actualCount,
					challengeLoser: loserId,
					timerEndsAt: Date.now() + PERUDO_REVEAL_DELAY_MS,
				};
			}

			case "revealDone": {
				return {
					...state,
					phase: "roundEnd",
					timerEndsAt: Date.now() + ROUND_END_DELAY_MS,
				};
			}

			case "nextRound": {
				const eliminatedIds = getEliminatedIds(state.players);
				const newTurnOrder = buildTurnOrder(state.seatOrder, eliminatedIds);

				if (newTurnOrder.length <= 1) {
					return {
						...state,
						phase: "gameOver",
						turnOrder: newTurnOrder,
						winnerId: newTurnOrder[0] ?? null,
					};
				}

				// Round starter: the loser of last challenge (if alive), otherwise next player clockwise
				let roundStarterId = state.challengeLoser ?? state.roundStarterId;
				if (eliminatedIds.has(roundStarterId)) {
					// Find next alive player from the loser's seat position
					const loserSeatIdx = state.seatOrder.indexOf(roundStarterId);
					for (let i = 1; i <= state.seatOrder.length; i++) {
						const candidate = state.seatOrder[(loserSeatIdx + i) % state.seatOrder.length]!;
						if (!eliminatedIds.has(candidate)) {
							roundStarterId = candidate;
							break;
						}
					}
				}

				const starterIndex = findPlayerIndex(newTurnOrder, roundStarterId);

				return {
					...state,
					phase: "starting",
					round: state.round + 1,
					turnOrder: newTurnOrder,
					currentPlayerIndex: starterIndex,
					currentPlayerId: roundStarterId,
					roundStarterId,
					timerEndsAt: Date.now() + ROUND_START_COUNTDOWN_MS,
				};
			}

			default:
				return null;
		}
	},

	getPlayerView(state: PerudoState, playerId: string): PerudoPlayerView {
		return buildPlayerView(state, playerId);
	},

	getSpectatorView(state: PerudoState): PerudoPlayerView {
		return {
			phase: state.phase,
			players: state.players.map((p) => ({
				id: p.id,
				name: p.name,
				avatarSeed: p.avatarSeed,
				diceCount: p.diceCount,
				isEliminated: p.isEliminated,
				dice: p.dice,
			})),
			turnOrder: state.turnOrder,
			currentPlayerId: state.currentPlayerId,
			isMyTurn: false,
			round: state.round,
			isPalificoRound: state.isPalificoRound,
			palificoPlayerId: state.isPalificoRound ? state.palificoPlayerId : null,
			currentBid: state.currentBid,
			bidHistory: state.bidHistory,
			myDice: [],
			myDiceCount: 0,
			challengerId: state.challengerId,
			challengedBid: state.challengedBid,
			actualCount: state.actualCount,
			challengeLoser: state.challengeLoser,
			timerEndsAt: state.timerEndsAt,
			winnerId: state.winnerId,
			totalDiceInPlay: totalDiceInPlay(state.players),
		};
	},

	getServerActions(): PerudoAction[] {
		return [];
	},

	isGameOver(state: PerudoState): boolean {
		return state.phase === "gameOver";
	},

	shouldPauseOnDisconnect(): boolean {
		return true;
	},

	getTimerConfig(state: PerudoState): TimerConfig | null {
		if (state.phase === "starting") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `starting-${state.round}`,
					durationMs: delay,
					action: { type: "startRound" },
				};
			}
		}
		if (state.phase === "bidding") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `bidding-${state.round}-${state.currentPlayerIndex}-${state.bidHistory.length}`,
					durationMs: delay,
					action: { type: "turnTimeout" },
				};
			}
		}
		if (state.phase === "reveal") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `reveal-${state.round}`,
					durationMs: delay,
					action: { type: "revealDone" },
				};
			}
		}
		if (state.phase === "roundEnd") {
			const delay = state.timerEndsAt - Date.now();
			if (delay > 0) {
				return {
					key: `roundEnd-${state.round}`,
					durationMs: delay,
					action: { type: "nextRound" },
				};
			}
		}
		return null;
	},
};
