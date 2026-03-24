import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GamePlugin } from "@/shared/types/game";
import type { PlayerInfo } from "@/shared/types/room";
import { createMockWs } from "../__tests__/helpers";
import type { ServerPlayer } from "../rooms/player-manager";
import { playerManager } from "../rooms/player-manager";
import { roomManager } from "../rooms/room-manager";
import { destroyEngine, GameEngine, getEngine, startGame } from "./engine";
import { registerPlugin } from "./registry";

// A minimal "counter" plugin for testing the engine in isolation
interface CounterState {
	count: number;
	gameOver: boolean;
	lastPlayerId: string | null;
}

interface CounterAction {
	type: "increment" | "decrement" | "finish";
}

const counterPlugin: GamePlugin<CounterState, CounterAction, {}> = {
	id: "test-counter",
	name: "Test Counter",
	minPlayers: 1,
	maxPlayers: 10,
	defaultConfig: {},

	createInitialState: () => ({
		count: 0,
		gameOver: false,
		lastPlayerId: null,
	}),

	reduce: (state, action, playerId) => {
		switch (action.type) {
			case "increment":
				return { ...state, count: state.count + 1, lastPlayerId: playerId };
			case "decrement":
				return { ...state, count: state.count - 1, lastPlayerId: playerId };
			case "finish":
				return { ...state, gameOver: true, lastPlayerId: playerId };
			default:
				return null;
		}
	},

	validateAction: (state, action) => {
		if (state.gameOver) {
			return "Game is over";
		}
		if (!["increment", "decrement", "finish"].includes(action.type)) {
			return "Unknown action";
		}
		return null;
	},

	getPlayerView: (state, playerId) => ({
		count: state.count,
		isMyTurn: true,
		myId: playerId,
	}),

	getSpectatorView: (state) => ({
		count: state.count,
		spectating: true,
	}),

	getServerActions: () => [],

	isGameOver: (state) => state.gameOver,
};

describe("GameEngine", () => {
	let host: ServerPlayer;
	let player2: ServerPlayer;
	let roomCode: string;
	let players: PlayerInfo[];

	beforeEach(() => {
		registerPlugin(counterPlugin);

		host = playerManager.create("Host", 0, createMockWs());
		player2 = playerManager.create("Player2", 0, createMockWs());

		const room = roomManager.create(host.id);
		roomCode = room.code;
		roomManager.join(roomCode, player2.id);

		players = [playerManager.toPlayerInfo(host), playerManager.toPlayerInfo(player2)];
	});

	afterEach(() => {
		destroyEngine(roomCode);
		if (host.roomCode) {
			roomManager.leave(host.roomCode, host.id);
		}
		if (player2.roomCode) {
			roomManager.leave(player2.roomCode, player2.id);
		}
		playerManager.remove(host.id);
		playerManager.remove(player2.id);
	});

	describe("startGame", () => {
		test("creates engine and initializes state", () => {
			const result = startGame(roomCode, "test-counter", players, {});

			expect(result.error).toBeUndefined();
			expect(result.engine).toBeDefined();

			const state = result.engine!.getState() as CounterState;
			expect(state.count).toBe(0);
			expect(state.gameOver).toBe(false);
		});

		test("sets room status to playing", () => {
			startGame(roomCode, "test-counter", players, {});

			const room = roomManager.get(roomCode);
			expect(room?.status).toBe("playing");
		});

		test("returns error for unknown game", () => {
			const result = startGame(roomCode, "nonexistent", players, {});
			expect(result.error).toBeDefined();
			expect(result.engine).toBeUndefined();
		});

		test("returns error for too few players", () => {
			// counter requires minPlayers=1, so make a plugin that needs 3
			const strictPlugin: GamePlugin = {
				...counterPlugin,
				id: "test-strict",
				minPlayers: 3,
			};
			registerPlugin(strictPlugin);

			const result = startGame(roomCode, "test-strict", players, {});
			expect(result.error).toBeDefined();
		});

		test("returns error for too many players", () => {
			const tinyPlugin: GamePlugin = {
				...counterPlugin,
				id: "test-tiny",
				maxPlayers: 1,
			};
			registerPlugin(tinyPlugin);

			const result = startGame(roomCode, "test-tiny", players, {});
			expect(result.error).toBeDefined();
		});

		test("cleans up existing engine for same room", () => {
			const result1 = startGame(roomCode, "test-counter", players, {});
			const engine1 = result1.engine!;

			const result2 = startGame(roomCode, "test-counter", players, {});
			expect(result2.engine).not.toBe(engine1);

			// Old engine should be destroyed (state nulled)
			expect(engine1.getState()).toBeNull();
		});
	});

	describe("handleAction", () => {
		test("successfully applies valid action", () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			const result = engine!.handleAction(host.id, { type: "increment" });
			expect(result.success).toBe(true);

			const state = engine!.getState() as CounterState;
			expect(state.count).toBe(1);
			expect(state.lastPlayerId).toBe(host.id);
		});

		test("applies multiple actions sequentially", () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.handleAction(host.id, { type: "increment" });
			engine!.handleAction(player2.id, { type: "increment" });
			engine!.handleAction(host.id, { type: "decrement" });

			const state = engine!.getState() as CounterState;
			expect(state.count).toBe(1);
		});

		test("returns error for invalid action", () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			// First finish the game
			engine!.handleAction(host.id, { type: "finish" });

			// Now try another action — should fail validation
			const result = engine!.handleAction(host.id, { type: "increment" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Game is over");
		});

		test("returns error when game not started", () => {
			const engine = new GameEngine(counterPlugin, roomCode);

			const result = engine.handleAction(host.id, { type: "increment" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Game not started");
		});

		test("finishes game when isGameOver returns true", () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.handleAction(host.id, { type: "finish" });

			const room = roomManager.get(roomCode);
			expect(room?.status).toBe("finished");
		});
	});

	describe("getEngine / destroyEngine", () => {
		test("getEngine returns engine after startGame", () => {
			startGame(roomCode, "test-counter", players, {});
			expect(getEngine(roomCode)).toBeDefined();
		});

		test("getEngine returns null for unknown room", () => {
			expect(getEngine("UNKNOWN")).toBeNull();
		});

		test("destroyEngine removes engine", () => {
			startGame(roomCode, "test-counter", players, {});
			destroyEngine(roomCode);
			expect(getEngine(roomCode)).toBeNull();
		});

		test("destroyEngine is safe for unknown room", () => {
			// Should not throw
			destroyEngine("UNKNOWN");
		});
	});

	describe("setTimer / clearTimer", () => {
		test("setTimer triggers action after delay", async () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.setTimer(50, { type: "increment" });

			// Wait for timer
			await new Promise((resolve) => setTimeout(resolve, 100));

			const state = engine!.getState() as CounterState;
			expect(state.count).toBe(1);
		});

		test("clearTimer prevents action", async () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.setTimer(50, { type: "increment" });
			engine!.clearTimer();

			await new Promise((resolve) => setTimeout(resolve, 100));

			const state = engine!.getState() as CounterState;
			expect(state.count).toBe(0);
		});

		test("setTimer replaces previous timer", async () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.setTimer(50, { type: "increment" });
			engine!.setTimer(50, { type: "decrement" });

			await new Promise((resolve) => setTimeout(resolve, 100));

			const state = engine!.getState() as CounterState;
			// Only decrement should have fired
			expect(state.count).toBe(-1);
		});
	});

	describe("pause / resume", () => {
		test("refreshes pause info when another player disconnects during pause", async () => {
			const { engine } = startGame(roomCode, "test-counter", players, {});

			engine!.pause(host.id);
			const firstPause = engine!.getPauseInfo();
			expect(firstPause?.disconnectedPlayerId).toBe(host.id);

			await new Promise((resolve) => setTimeout(resolve, 5));

			engine!.pause(player2.id);
			const secondPause = engine!.getPauseInfo();

			expect(secondPause?.disconnectedPlayerId).toBe(player2.id);
			expect(secondPause?.timeoutAt ?? 0).toBeGreaterThan(firstPause?.timeoutAt ?? 0);
		});
	});

	describe("broadcastState", () => {
		test("sends personalized views to players", () => {
			const sentMessages: string[] = [];
			const ws = createMockWs();
			(ws as any).send = (data: string) => {
				sentMessages.push(data);
				return 0;
			};

			// Recreate host with our capturing ws
			playerManager.remove(host.id);
			host = playerManager.create("Host", 0, ws);
			const room = roomManager.get(roomCode)!;
			room.playerIds[0] = host.id;
			room.hostId = host.id;
			host.roomCode = roomCode;

			players = [playerManager.toPlayerInfo(host), playerManager.toPlayerInfo(player2)];

			startGame(roomCode, "test-counter", players, {});

			// startGame calls broadcastState, so check sentMessages
			expect(sentMessages.length).toBeGreaterThan(0);

			const parsed = JSON.parse(sentMessages[0]!);
			expect(parsed.type).toBe("gameState");
			expect(parsed.gameState.myId).toBe(host.id);
			expect(parsed.gameState.count).toBe(0);
		});
	});
});
