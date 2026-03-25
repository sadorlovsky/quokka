import type { GamePlugin } from "@/shared/types/game";
import type { PlayerInfo } from "@/shared/types/room";
import type {
	CardProperty,
	CutTarget,
	HandCard,
	Rotation,
	TapewormAction,
	TapewormConfig,
	TapewormPlayerState,
	TapewormPlayerView,
	TapewormState,
	ValidPlacement,
	WormColor,
} from "@/shared/types/tapeworm";
import { DEFAULT_TAPEWORM_CONFIG } from "@/shared/types/tapeworm";
import { createDeck } from "./deck";
import {
	detectRingworm,
	getColorAtDirection,
	getNeighborKey,
	getOpenEnds,
	getOppositeDirection,
	getValidCutTargets,
	getValidPlacements,
	isChainPlacement,
	isValidPlacement,
	performCut,
	rotatePaths,
} from "./validation";

function shuffle<T>(arr: T[]): T[] {
	const result = [...arr];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j]!, result[i]!];
	}
	return result;
}

// --- Helpers ---

function updatePlayerHandSizes(
	players: TapewormPlayerState[],
	hands: Record<string, HandCard[]>,
): TapewormPlayerState[] {
	return players.map((p) => ({
		...p,
		handSize: (hands[p.id] ?? []).length,
	}));
}

function drawCardFromDeck(
	state: TapewormState,
	playerId: string,
): { state: TapewormState; drew: boolean } {
	if (state.deck.length === 0) {
		return { state, drew: false };
	}

	const drawn = state.deck[0]!;
	const newDeck = state.deck.slice(1);
	const newHand = [...(state.hands[playerId] ?? []), drawn];
	const newHands = { ...state.hands, [playerId]: newHand };

	return {
		state: {
			...state,
			deck: newDeck,
			hands: newHands,
			players: updatePlayerHandSizes(state.players, newHands),
		},
		drew: true,
	};
}

function computeValidPlacements(
	state: TapewormState,
	playerId: string,
): Record<string, ValidPlacement[]> {
	const hand = state.hands[playerId];
	if (!hand) {
		return {};
	}

	const result: Record<string, ValidPlacement[]> = {};

	// After playing a card, chaining requires a chain color.
	// If chainColor is null (e.g. placed a color-transition card), no tile chaining is possible.
	if (state.cardsPlayedThisTurn > 0 && !state.chainColor) {
		return result;
	}

	const chaining = state.chainColor && state.cardsPlayedThisTurn > 0 && state.lastPlacedPosition;

	for (const handCard of hand) {
		// Skip knife cards — they use playKnife action, not placeTile
		if (handCard.card.type === "knife") {
			continue;
		}

		const allPlacements = getValidPlacements(state.board, handCard.card);

		const placements = chaining
			? allPlacements.filter((p) =>
					isChainPlacement(
						state.board,
						state.lastPlacedPosition!,
						state.chainColor!,
						handCard.card,
						p.x,
						p.y,
						p.rotation,
					),
				)
			: allPlacements;

		if (placements.length > 0) {
			result[handCard.id] = placements;
		}
	}

	return result;
}

function computePlayableKnives(state: TapewormState, playerId: string): string[] {
	const hand = state.hands[playerId];
	if (!hand) {
		return [];
	}

	const knives: string[] = [];
	for (const handCard of hand) {
		if (handCard.card.type === "knife" && handCard.card.knifeColor) {
			const targets = getValidCutTargets(state.board, handCard.card.knifeColor);
			if (targets.length > 0) {
				knives.push(handCard.id);
			}
		}
	}
	return knives;
}

/**
 * Determine the chain color after placing a card.
 *
 * For the first card of the turn (no previous chain), use the color of the
 * path that connects to the open end where the card was placed.
 *
 * For subsequent cards, the chain continues with the color of the path that
 * connects to the previously placed card. A color-transition card does NOT
 * break the chain — the incoming color determines continuation.
 */
function getPlacedCardColor(
	board: Record<string, import("@/shared/types/tapeworm").PlacedCard>,
	handCard: HandCard,
	rotation: Rotation,
	x: number,
	y: number,
	prevChainColor: WormColor | null,
	lastPlacedPosition: { x: number; y: number } | null,
): WormColor | null {
	const rotated = rotatePaths(handCard.card.paths, rotation);
	if (rotated.length === 0) {
		return null;
	}

	// If chaining (2nd+ card this turn), find the color of the path facing the last placed card
	if (prevChainColor && lastPlacedPosition) {
		const lastKey = `${lastPlacedPosition.x},${lastPlacedPosition.y}`;
		for (const path of rotated) {
			for (const dir of path.directions) {
				if (getNeighborKey(x, y, dir) === lastKey) {
					// Verify the last card also has chainColor on that edge
					const lastPlaced = board[lastKey];
					if (lastPlaced) {
						const lastColor = getColorAtDirection(lastPlaced, getOppositeDirection(dir));
						if (lastColor === prevChainColor && path.color === prevChainColor) {
							return prevChainColor;
						}
					}
				}
			}
		}
	}

	// First card of the turn: find which open end we connected to,
	// and use that path's color
	for (const path of rotated) {
		for (const dir of path.directions) {
			const neighborKey = getNeighborKey(x, y, dir);
			const neighbor = board[neighborKey];
			if (neighbor) {
				const neighborColor = getColorAtDirection(neighbor, getOppositeDirection(dir));
				if (neighborColor === path.color) {
					return path.color;
				}
			}
		}
	}

	return null;
}

function canPlayerChain(state: TapewormState, playerId: string): boolean {
	return (
		Object.keys(computeValidPlacements(state, playerId)).length > 0 ||
		computePlayableKnives(state, playerId).length > 0
	);
}

// --- Game Over ---

function gameOver(state: TapewormState, winnerId: string): TapewormState {
	return { ...state, phase: "gameOver", winnerId };
}

// --- Turn Advancement ---

function advanceTurn(state: TapewormState): TapewormState {
	let deck = [...state.deck];
	const hands = { ...state.hands };
	let currentIndex = state.currentPlayerIndex;

	for (let attempt = 0; attempt < state.turnOrder.length; attempt++) {
		const nextIndex = (currentIndex + 1) % state.turnOrder.length;
		const nextPlayerId = state.turnOrder[nextIndex]!;

		let hasDrawn = false;
		if (deck.length > 0) {
			const drawn = deck[0]!;
			deck = deck.slice(1);
			hands[nextPlayerId] = [...(hands[nextPlayerId] ?? []), drawn];
			hasDrawn = true;
		}

		const newState: TapewormState = {
			...state,
			phase: "playing",
			currentPlayerIndex: nextIndex,
			currentPlayerId: nextPlayerId,
			deck,
			hands,
			hasDrawn,
			chainColor: null,
			lastPlacedPosition: null,
			cardsPlayedThisTurn: 0,
			pendingDiscard: null,
			pendingProperty: null,
			players: updatePlayerHandSizes(state.players, hands),
		};

		const validPlacements = computeValidPlacements(newState, nextPlayerId);
		const playableKnives = computePlayableKnives(newState, nextPlayerId);
		console.log(
			`[tapeworm] advanceTurn checking player ${nextPlayerId}: placements=${Object.keys(validPlacements).length}, knives=${playableKnives.length}, hand=${(hands[nextPlayerId] ?? []).length}`,
		);
		if (Object.keys(validPlacements).length > 0 || playableKnives.length > 0) {
			return newState;
		}

		currentIndex = nextIndex;
	}

	// Full cycle — nobody can play
	const openEnds = getOpenEnds(state.board);
	let winnerId: string;

	if (openEnds.length === 0) {
		winnerId = state.currentPlayerId;
	} else {
		let minCards = Infinity;
		winnerId = state.turnOrder[0]!;
		for (const pid of state.turnOrder) {
			const handSize = (hands[pid] ?? []).length;
			if (handSize < minCards) {
				minCards = handSize;
				winnerId = pid;
			}
		}
	}

	return {
		...state,
		deck,
		hands,
		chainColor: null,
		lastPlacedPosition: null,
		cardsPlayedThisTurn: 0,
		pendingDiscard: null,
		pendingProperty: null,
		phase: "gameOver",
		winnerId,
		players: updatePlayerHandSizes(state.players, hands),
	};
}

// --- Property Resolution ---

function enterPropertyPhase(
	state: TapewormState,
	playerId: string,
	property: CardProperty,
	remainingActivations?: number,
): TapewormState {
	const remaining = remainingActivations ?? property.multiplier;

	switch (property.trait) {
		case "DIG": {
			const { state: newState, drew } = drawCardFromDeck(state, playerId);
			if (!drew) {
				// Deck empty — skip DIG
				return completeOneActivation({
					...newState,
					pendingProperty: {
						trait: "DIG",
						remainingActivations: remaining,
						playerId,
					},
				});
			}
			return {
				...newState,
				phase: "digging",
				pendingProperty: {
					trait: "DIG",
					remainingActivations: remaining,
					playerId,
				},
			};
		}

		case "PEEK": {
			const { state: newState, drew } = drawCardFromDeck(state, playerId);
			if (!drew) {
				return completeOneActivation({
					...newState,
					pendingProperty: {
						trait: "PEEK",
						remainingActivations: remaining,
						playerId,
					},
				});
			}
			return {
				...newState,
				phase: "peeking",
				pendingProperty: {
					trait: "PEEK",
					remainingActivations: remaining,
					playerId,
				},
			};
		}

		case "HATCH": {
			return {
				...state,
				phase: "hatching",
				pendingProperty: {
					trait: "HATCH",
					remainingActivations: remaining,
					playerId,
				},
			};
		}

		case "SWAP": {
			return {
				...state,
				phase: "swapping",
				pendingProperty: {
					trait: "SWAP",
					remainingActivations: remaining,
					playerId,
					swapStep: "pickPlayer",
				},
			};
		}

		default:
			// START — no effect
			return state;
	}
}

function completeOneActivation(state: TapewormState): TapewormState {
	const pending = state.pendingProperty;
	if (!pending) {
		return afterPropertyResolved(state, state.currentPlayerId);
	}

	const newRemaining = pending.remainingActivations - 1;

	if (newRemaining <= 0) {
		return afterPropertyResolved({ ...state, pendingProperty: null }, pending.playerId);
	}

	// Re-enter the property phase for the next activation
	return enterPropertyPhase(
		{ ...state, pendingProperty: null },
		pending.playerId,
		{ trait: pending.trait, multiplier: 1 },
		newRemaining,
	);
}

function afterPropertyResolved(state: TapewormState, playerId: string): TapewormState {
	const hand = state.hands[playerId] ?? [];

	// Check win — empty hand after property resolution
	if (hand.length === 0) {
		return gameOver(state, playerId);
	}

	// Get the last placed card to check if it was a head
	const lastKey = state.lastPlacedPosition
		? `${state.lastPlacedPosition.x},${state.lastPlacedPosition.y}`
		: null;
	const lastPlaced = lastKey ? state.board[lastKey] : null;
	const wasHead = lastPlaced?.card.type === "head";

	if (wasHead) {
		return advanceTurn(state);
	}

	const playingState: TapewormState = {
		...state,
		phase: "playing",
		pendingProperty: null,
	};

	if (!canPlayerChain(playingState, playerId)) {
		return advanceTurn(playingState);
	}

	return playingState;
}

// --- After Placement ---

function afterPlacement(
	newState: TapewormState,
	playerId: string,
	handCard: HandCard,
	x: number,
	y: number,
	rotation: Rotation,
	newHand: HandCard[],
): TapewormState {
	// 1. Check win — empty hand
	if (newHand.length === 0) {
		return gameOver(newState, playerId);
	}

	// 2. Dead ends — all open ends closed
	const openEnds = getOpenEnds(newState.board);
	if (openEnds.length === 0) {
		return gameOver(newState, playerId);
	}

	// 3. Ringworm — closed loop detection
	const isRing = detectRingworm(newState.board, handCard.card, x, y, rotation);
	if (isRing && newHand.length > 0) {
		const discardCount = Math.min(2, newHand.length);
		return {
			...newState,
			phase: "discarding",
			pendingDiscard: { playerId, count: discardCount },
		};
	}

	// 4. Card property — trigger resolution phase
	const property = handCard.card.property;
	if (property && property.trait !== "START") {
		return enterPropertyPhase(newState, playerId, property);
	}

	// 5. Head card → end turn immediately
	if (handCard.card.type === "head") {
		return advanceTurn(newState);
	}

	// 6. Check if player can continue chain
	if (!canPlayerChain(newState, playerId)) {
		return advanceTurn(newState);
	}

	return newState;
}

// --- After Discard (ringworm) ---

function afterDiscard(state: TapewormState, playerId: string): TapewormState {
	const hand = state.hands[playerId] ?? [];

	if (hand.length === 0) {
		return gameOver(state, playerId);
	}

	// Get the last placed card
	const lastKey = state.lastPlacedPosition
		? `${state.lastPlacedPosition.x},${state.lastPlacedPosition.y}`
		: null;
	const lastPlaced = lastKey ? state.board[lastKey] : null;

	// After ringworm discard, check if the placed card had a property
	const property = lastPlaced?.card.property;
	if (property && property.trait !== "START") {
		return enterPropertyPhase(
			{ ...state, phase: "playing", pendingDiscard: null },
			playerId,
			property,
		);
	}

	const wasHead = lastPlaced?.card.type === "head";
	if (wasHead) {
		return advanceTurn(state);
	}

	const playingState: TapewormState = {
		...state,
		phase: "playing",
		pendingDiscard: null,
	};

	if (!canPlayerChain(playingState, playerId)) {
		return advanceTurn(playingState);
	}

	return playingState;
}

// --- Plugin ---

export const tapewormPlugin: GamePlugin<TapewormState, TapewormAction, TapewormConfig> = {
	id: "tapeworm",
	name: "Червь",
	minPlayers: 2,
	maxPlayers: 4,
	defaultConfig: DEFAULT_TAPEWORM_CONFIG,

	createInitialState(players: PlayerInfo[], config: TapewormConfig): TapewormState {
		const merged = { ...DEFAULT_TAPEWORM_CONFIG, ...config };
		const { deck, startCard } = createDeck();

		const hands: Record<string, HandCard[]> = {};
		let deckCursor = 0;
		const turnOrder = shuffle(players.map((p) => p.id));

		for (const pid of turnOrder) {
			hands[pid] = deck.slice(deckCursor, deckCursor + merged.handSize);
			deckCursor += merged.handSize;
		}

		const remainingDeck = deck.slice(deckCursor);

		const board: Record<string, import("@/shared/types/tapeworm").PlacedCard> = {
			"0,0": { cardId: "start", card: startCard, rotation: 0 },
		};

		const firstPlayerId = turnOrder[0]!;

		// Auto-draw for first player
		let firstDeck = [...remainingDeck];
		if (firstDeck.length > 0) {
			const drawn = firstDeck[0]!;
			firstDeck = firstDeck.slice(1);
			hands[firstPlayerId] = [...hands[firstPlayerId]!, drawn];
		}

		const playerStates: TapewormPlayerState[] = players.map((p) => ({
			id: p.id,
			name: p.name,
			avatarSeed: p.avatarSeed,
			handSize: (hands[p.id] ?? []).length,
		}));

		return {
			phase: "playing",
			board,
			deck: firstDeck,
			hands,
			turnOrder,
			currentPlayerIndex: 0,
			currentPlayerId: firstPlayerId,
			hasDrawn: true,
			chainColor: null,
			lastPlacedPosition: null,
			cardsPlayedThisTurn: 0,
			players: playerStates,
			winnerId: null,
			pendingDiscard: null,
			pendingProperty: null,
		};
	},

	validateAction(state: TapewormState, action: TapewormAction, playerId: string): string | null {
		if (state.phase === "gameOver") {
			return "Game is over";
		}

		switch (action.type) {
			case "placeTile": {
				if (state.phase !== "playing") {
					return "Cannot place tiles now";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}

				const hand = state.hands[playerId];
				if (!hand) {
					return "No hand found";
				}

				const handCard = hand.find((c) => c.id === action.cardId);
				if (!handCard) {
					return "Card not in hand";
				}

				if (handCard.card.type === "knife") {
					return "Use playKnifeAndCut for knife cards";
				}

				if (!isValidPlacement(state.board, handCard.card, action.x, action.y, action.rotation)) {
					return "Invalid placement";
				}

				if (state.chainColor && state.cardsPlayedThisTurn > 0 && state.lastPlacedPosition) {
					if (
						!isChainPlacement(
							state.board,
							state.lastPlacedPosition,
							state.chainColor,
							handCard.card,
							action.x,
							action.y,
							action.rotation,
						)
					) {
						return "Must continue chain from last placed card";
					}
				}

				return null;
			}

			case "endTurn": {
				if (state.phase !== "playing") {
					return "Cannot end turn now";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}
				return null;
			}

			case "discardCards": {
				if (state.phase !== "discarding") {
					return "Not in discard phase";
				}
				if (!state.pendingDiscard) {
					return "No pending discard";
				}
				if (state.pendingDiscard.playerId !== playerId) {
					return "Not your discard";
				}

				const hand = state.hands[playerId];
				if (!hand) {
					return "No hand found";
				}

				if (action.cardIds.length !== state.pendingDiscard.count) {
					return `Must discard exactly ${state.pendingDiscard.count} cards`;
				}

				const seen = new Set<string>();
				for (const cardId of action.cardIds) {
					if (seen.has(cardId)) {
						return "Duplicate card ID";
					}
					seen.add(cardId);
					if (!hand.some((c) => c.id === cardId)) {
						return "Card not in hand";
					}
				}

				return null;
			}

			case "playKnife": {
				if (state.phase !== "playing") {
					return "Cannot play knife now";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}

				const hand = state.hands[playerId];
				if (!hand) {
					return "No hand found";
				}

				const handCard = hand.find((c) => c.id === action.cardId);
				if (!handCard) {
					return "Card not in hand";
				}
				if (handCard.card.type !== "knife") {
					return "Card is not a knife";
				}
				if (!handCard.card.knifeColor) {
					return "Knife has no color";
				}

				const targets = getValidCutTargets(state.board, handCard.card.knifeColor);
				if (targets.length === 0) {
					return "No valid cut targets";
				}

				return null;
			}

			case "cutSegment": {
				if (state.phase !== "cutting") {
					return "Not in cutting phase";
				}
				if (!state.pendingProperty) {
					return "No pending cut";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your cut";
				}
				if (!state.pendingProperty.cutColor) {
					return "No cut color";
				}

				const targets = getValidCutTargets(state.board, state.pendingProperty.cutColor);
				const isValid = targets.some(
					(t) => t.x === action.x && t.y === action.y && t.direction === action.direction,
				);
				if (!isValid) {
					return "Invalid cut target";
				}

				return null;
			}

			case "playKnifeAndCut": {
				if (state.phase !== "playing") {
					return "Cannot play knife now";
				}
				if (playerId !== state.currentPlayerId) {
					return "Not your turn";
				}

				const hand = state.hands[playerId];
				if (!hand) {
					return "No hand found";
				}

				const handCard = hand.find((c) => c.id === action.cardId);
				if (!handCard) {
					return "Card not in hand";
				}
				if (handCard.card.type !== "knife") {
					return "Card is not a knife";
				}
				if (!handCard.card.knifeColor) {
					return "Knife has no color";
				}

				const targets = getValidCutTargets(state.board, handCard.card.knifeColor);
				if (targets.length === 0) {
					return "No valid cut targets";
				}

				const isValid = targets.some(
					(t) => t.x === action.x && t.y === action.y && t.direction === action.direction,
				);
				if (!isValid) {
					return "Invalid cut target";
				}

				return null;
			}

			case "digDiscard": {
				if (state.phase !== "digging") {
					return "Not in dig phase";
				}
				if (!state.pendingProperty) {
					return "No pending dig";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your dig";
				}

				const hand = state.hands[playerId];
				if (!hand?.some((c) => c.id === action.cardId)) {
					return "Card not in hand";
				}

				return null;
			}

			case "peekReturn": {
				if (state.phase !== "peeking") {
					return "Not in peek phase";
				}
				if (!state.pendingProperty) {
					return "No pending peek";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your peek";
				}

				const hand = state.hands[playerId];
				if (!hand?.some((c) => c.id === action.cardId)) {
					return "Card not in hand";
				}

				return null;
			}

			case "hatchTarget": {
				if (state.phase !== "hatching") {
					return "Not in hatch phase";
				}
				if (!state.pendingProperty) {
					return "No pending hatch";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your hatch";
				}
				if (action.targetPlayerId === playerId) {
					return "Cannot target yourself";
				}
				if (!state.hands[action.targetPlayerId]) {
					return "Invalid target player";
				}

				return null;
			}

			case "swapPickPlayer": {
				if (state.phase !== "swapping") {
					return "Not in swap phase";
				}
				if (!state.pendingProperty) {
					return "No pending swap";
				}
				if (state.pendingProperty.swapStep !== "pickPlayer") {
					return "Wrong swap step";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your swap";
				}
				if (action.targetPlayerId === playerId) {
					return "Cannot swap with yourself";
				}
				if (!state.hands[action.targetPlayerId]) {
					return "Invalid target player";
				}

				return null;
			}

			case "swapTakeCard": {
				if (state.phase !== "swapping") {
					return "Not in swap phase";
				}
				if (!state.pendingProperty) {
					return "No pending swap";
				}
				if (state.pendingProperty.swapStep !== "decideExchange") {
					return "Wrong swap step";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your swap";
				}

				if (action.cardId !== null) {
					const targetHand = state.hands[state.pendingProperty.swapTargetPlayerId!];
					if (!targetHand?.some((c) => c.id === action.cardId)) {
						return "Card not in target's hand";
					}
				}

				return null;
			}

			case "swapGiveCard": {
				if (state.phase !== "swapping") {
					return "Not in swap phase";
				}
				if (!state.pendingProperty) {
					return "No pending swap";
				}
				if (state.pendingProperty.swapStep !== "giveCard") {
					return "Wrong swap step";
				}
				if (state.pendingProperty.playerId !== playerId) {
					return "Not your swap";
				}

				const hand = state.hands[playerId];
				if (!hand?.some((c) => c.id === action.cardId)) {
					return "Card not in hand";
				}

				return null;
			}

			default:
				return "Unknown action";
		}
	},

	reduce(state: TapewormState, action: TapewormAction, playerId: string): TapewormState | null {
		switch (action.type) {
			case "placeTile": {
				const hand = state.hands[playerId]!;
				const cardIndex = hand.findIndex((c) => c.id === action.cardId);
				if (cardIndex === -1) {
					return null;
				}

				const handCard = hand[cardIndex]!;
				const newHand = hand.filter((_, i) => i !== cardIndex);
				const newHands = { ...state.hands, [playerId]: newHand };

				const key = `${action.x},${action.y}`;
				const newBoard = {
					...state.board,
					[key]: {
						cardId: handCard.id,
						card: handCard.card,
						rotation: action.rotation,
					},
				};

				const chainColor = getPlacedCardColor(
					newBoard,
					handCard,
					action.rotation,
					action.x,
					action.y,
					state.chainColor,
					state.lastPlacedPosition,
				);

				const newState: TapewormState = {
					...state,
					board: newBoard,
					hands: newHands,
					chainColor,
					lastPlacedPosition: { x: action.x, y: action.y },
					cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
					players: updatePlayerHandSizes(state.players, newHands),
				};

				return afterPlacement(
					newState,
					playerId,
					handCard,
					action.x,
					action.y,
					action.rotation,
					newHand,
				);
			}

			case "endTurn": {
				return advanceTurn(state);
			}

			case "discardCards": {
				if (!state.pendingDiscard) {
					return null;
				}

				const hand = state.hands[playerId]!;
				const discardSet = new Set(action.cardIds);
				const newHand = hand.filter((c) => !discardSet.has(c.id));
				const newHands = { ...state.hands, [playerId]: newHand };

				const newState: TapewormState = {
					...state,
					hands: newHands,
					pendingDiscard: null,
					players: updatePlayerHandSizes(state.players, newHands),
				};

				return afterDiscard(newState, playerId);
			}

			case "playKnife": {
				const hand = state.hands[playerId]!;
				const cardIndex = hand.findIndex((c) => c.id === action.cardId);
				if (cardIndex === -1) {
					return null;
				}

				const handCard = hand[cardIndex]!;
				const newHand = hand.filter((_, i) => i !== cardIndex);
				const newHands = { ...state.hands, [playerId]: newHand };

				// Check win — empty hand after playing knife
				if (newHand.length === 0) {
					return gameOver(
						{
							...state,
							hands: newHands,
							players: updatePlayerHandSizes(state.players, newHands),
						},
						playerId,
					);
				}

				return {
					...state,
					hands: newHands,
					phase: "cutting",
					cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
					pendingProperty: {
						trait: "CUT",
						remainingActivations: 1,
						playerId,
						cutColor: handCard.card.knifeColor ?? "rainbow",
					},
					players: updatePlayerHandSizes(state.players, newHands),
				};
			}

			case "cutSegment": {
				if (!state.pendingProperty) {
					return null;
				}

				const { newBoard } = performCut(state.board, action.x, action.y, action.direction);

				// Determine the cut color for chaining
				const cutTarget = getValidCutTargets(state.board, state.pendingProperty.cutColor!).find(
					(t) => t.x === action.x && t.y === action.y && t.direction === action.direction,
				);
				const chainColor: WormColor | null = cutTarget?.color ?? null;

				const newState: TapewormState = {
					...state,
					board: newBoard,
					phase: "playing",
					chainColor,
					pendingProperty: null,
					lastPlacedPosition: { x: action.x, y: action.y },
				};

				// Check if player can continue (chain or otherwise)
				if (!canPlayerChain(newState, state.pendingProperty.playerId)) {
					return advanceTurn(newState);
				}

				return newState;
			}

			case "playKnifeAndCut": {
				const hand = state.hands[playerId]!;
				const cardIndex = hand.findIndex((c) => c.id === action.cardId);
				if (cardIndex === -1) {
					return null;
				}

				const handCard = hand[cardIndex]!;
				const newHand = hand.filter((_, i) => i !== cardIndex);
				const newHands = { ...state.hands, [playerId]: newHand };

				// Check win — empty hand after playing knife
				if (newHand.length === 0) {
					return gameOver(
						{
							...state,
							hands: newHands,
							players: updatePlayerHandSizes(state.players, newHands),
						},
						playerId,
					);
				}

				// Perform the cut immediately
				const { newBoard } = performCut(state.board, action.x, action.y, action.direction);

				// Determine chain color from the cut target
				const knifeColor = handCard.card.knifeColor ?? "rainbow";
				const cutTarget = getValidCutTargets(state.board, knifeColor).find(
					(t) => t.x === action.x && t.y === action.y && t.direction === action.direction,
				);
				const chainColor: WormColor | null = cutTarget?.color ?? null;

				const newState: TapewormState = {
					...state,
					hands: newHands,
					board: newBoard,
					phase: "playing",
					cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
					chainColor,
					pendingProperty: null,
					lastPlacedPosition: { x: action.x, y: action.y },
					players: updatePlayerHandSizes(state.players, newHands),
				};

				if (!canPlayerChain(newState, playerId)) {
					return advanceTurn(newState);
				}

				return newState;
			}

			case "digDiscard": {
				if (!state.pendingProperty) {
					return null;
				}

				const hand = state.hands[playerId]!;
				const newHand = hand.filter((c) => c.id !== action.cardId);
				const newHands = { ...state.hands, [playerId]: newHand };

				return completeOneActivation({
					...state,
					hands: newHands,
					players: updatePlayerHandSizes(state.players, newHands),
				});
			}

			case "peekReturn": {
				if (!state.pendingProperty) {
					return null;
				}

				const hand = state.hands[playerId]!;
				const card = hand.find((c) => c.id === action.cardId);
				if (!card) {
					return null;
				}

				const newHand = hand.filter((c) => c.id !== action.cardId);
				const newDeck = [card, ...state.deck]; // Put on top
				const newHands = { ...state.hands, [playerId]: newHand };

				return completeOneActivation({
					...state,
					hands: newHands,
					deck: newDeck,
					players: updatePlayerHandSizes(state.players, newHands),
				});
			}

			case "hatchTarget": {
				if (!state.pendingProperty) {
					return null;
				}

				const { state: newState } = drawCardFromDeck(state, action.targetPlayerId);

				return completeOneActivation(newState);
			}

			case "swapPickPlayer": {
				if (!state.pendingProperty) {
					return null;
				}

				return {
					...state,
					pendingProperty: {
						...state.pendingProperty,
						swapStep: "decideExchange",
						swapTargetPlayerId: action.targetPlayerId,
					},
				};
			}

			case "swapTakeCard": {
				if (!state.pendingProperty?.swapTargetPlayerId) {
					return null;
				}

				if (action.cardId === null) {
					// Skip — don't take anything
					return completeOneActivation({
						...state,
						pendingProperty: {
							...state.pendingProperty,
							swapStep: undefined,
							swapTargetPlayerId: undefined,
						},
					});
				}

				// Take card from target
				const targetId = state.pendingProperty.swapTargetPlayerId;
				const targetHand = state.hands[targetId]!;
				const takenCard = targetHand.find((c) => c.id === action.cardId);
				if (!takenCard) {
					return null;
				}

				const newTargetHand = targetHand.filter((c) => c.id !== action.cardId);
				const newPlayerHand = [...(state.hands[playerId] ?? []), takenCard];
				const newHands = {
					...state.hands,
					[targetId]: newTargetHand,
					[playerId]: newPlayerHand,
				};

				return {
					...state,
					hands: newHands,
					players: updatePlayerHandSizes(state.players, newHands),
					pendingProperty: {
						...state.pendingProperty,
						swapStep: "giveCard",
					},
				};
			}

			case "swapGiveCard": {
				if (!state.pendingProperty?.swapTargetPlayerId) {
					return null;
				}

				const targetId = state.pendingProperty.swapTargetPlayerId;
				const playerHand = state.hands[playerId]!;
				const givenCard = playerHand.find((c) => c.id === action.cardId);
				if (!givenCard) {
					return null;
				}

				const newPlayerHand = playerHand.filter((c) => c.id !== action.cardId);
				const newTargetHand = [...(state.hands[targetId] ?? []), givenCard];
				const newHands = {
					...state.hands,
					[playerId]: newPlayerHand,
					[targetId]: newTargetHand,
				};

				return completeOneActivation({
					...state,
					hands: newHands,
					players: updatePlayerHandSizes(state.players, newHands),
					pendingProperty: {
						...state.pendingProperty,
						swapStep: undefined,
						swapTargetPlayerId: undefined,
					},
				});
			}

			default:
				return null;
		}
	},

	getPlayerView(state: TapewormState, playerId: string): TapewormPlayerView {
		const isMyTurn = playerId === state.currentPlayerId;
		const hand = state.hands[playerId] ?? [];

		const validPlacements =
			isMyTurn && state.phase === "playing" ? computeValidPlacements(state, playerId) : {};

		const playableKnives =
			isMyTurn && state.phase === "playing" ? computePlayableKnives(state, playerId) : [];

		if (isMyTurn && state.phase === "playing") {
			const validCount = Object.keys(validPlacements).length;
			const knivesCount = playableKnives.length;
			console.log(
				`[tapeworm] getPlayerView for current player ${playerId}: validPlacements=${validCount}, knives=${knivesCount}, hand=${hand.length}, board=${Object.keys(state.board).length}, deck=${state.deck.length}, cardsPlayed=${state.cardsPlayedThisTurn}, chainColor=${state.chainColor}`,
			);
			if (validCount === 0 && knivesCount === 0) {
				// Log each card for debugging
				for (const hc of hand) {
					if (hc.card.type === "knife") {
						continue;
					}
					const paths = hc.card.paths.map((p) => `${p.directions.join("+")}:${p.color}`).join(", ");
					const placements = getValidPlacements(state.board, hc.card);
					console.warn(
						`  card ${hc.id} (${hc.card.type}) [${paths}] → ${placements.length} placements`,
					);
				}
			}
		}

		// SWAP: expose target's hand only to the swapping player during decideExchange
		let swapTargetHand: HandCard[] | undefined;
		if (
			state.phase === "swapping" &&
			state.pendingProperty?.playerId === playerId &&
			state.pendingProperty.swapStep === "decideExchange" &&
			state.pendingProperty.swapTargetPlayerId
		) {
			swapTargetHand = state.hands[state.pendingProperty.swapTargetPlayerId] ?? [];
		}

		// CUT: valid cut targets only for the cutting player
		let validCutTargets: CutTarget[] | undefined;
		if (
			state.phase === "cutting" &&
			state.pendingProperty?.playerId === playerId &&
			state.pendingProperty.cutColor
		) {
			validCutTargets = getValidCutTargets(state.board, state.pendingProperty.cutColor);
		}

		// Pre-compute cut targets per knife for preview during playing phase
		let knifeCutTargets: Record<string, CutTarget[]> | undefined;
		if (isMyTurn && state.phase === "playing" && playableKnives.length > 0) {
			knifeCutTargets = {};
			for (const knifeId of playableKnives) {
				const knifeCard = hand.find((c) => c.id === knifeId);
				if (knifeCard?.card.knifeColor) {
					knifeCutTargets[knifeId] = getValidCutTargets(state.board, knifeCard.card.knifeColor);
				}
			}
		}

		return {
			phase: state.phase,
			board: state.board,
			hand,
			players: state.players,
			turnOrder: state.turnOrder,
			currentPlayerId: state.currentPlayerId,
			isMyTurn,
			hasDrawn: state.hasDrawn,
			chainColor: state.chainColor,
			cardsPlayedThisTurn: state.cardsPlayedThisTurn,
			deckSize: state.deck.length,
			validPlacements,
			winnerId: state.winnerId,
			pendingDiscard: state.pendingDiscard,
			pendingProperty: state.pendingProperty,
			swapTargetHand,
			validCutTargets,
			playableKnives,
			knifeCutTargets,
		};
	},

	getSpectatorView(state: TapewormState): TapewormPlayerView {
		return {
			phase: state.phase,
			board: state.board,
			hand: [],
			players: state.players,
			turnOrder: state.turnOrder,
			currentPlayerId: state.currentPlayerId,
			isMyTurn: false,
			hasDrawn: state.hasDrawn,
			chainColor: state.chainColor,
			cardsPlayedThisTurn: state.cardsPlayedThisTurn,
			deckSize: state.deck.length,
			validPlacements: {},
			winnerId: state.winnerId,
			pendingDiscard: state.pendingDiscard,
			pendingProperty: state.pendingProperty,
			playableKnives: [],
		};
	},

	getServerActions(): TapewormAction[] {
		return [];
	},

	isGameOver(state: TapewormState): boolean {
		return state.phase === "gameOver";
	},

	shouldPauseOnDisconnect(): boolean {
		return true;
	},

	getTimerConfig(): null {
		return null;
	},
};
