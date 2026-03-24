import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GamePlugin } from "@/shared/types/game";
import type { PlayerInfo } from "@/shared/types/room";
import { createMockWs } from "../__tests__/helpers";
import { destroyEngine, getEngine, startGame } from "../games/engine";
import { registerPlugin } from "../games/registry";
import type { ServerPlayer } from "../rooms/player-manager";
import { playerManager } from "../rooms/player-manager";
import { roomManager } from "../rooms/room-manager";
import { handleMessage } from "./handler";
import { RateLimiter } from "./rate-limit";

interface TestState {
	phase: "playing" | "gameOver";
	lastPlayerId: string | null;
}

interface TestAction {
	type: "finish";
}

interface TestDrawingState {
	phase: "showing" | "starting";
	mode: "drawing";
	currentShowerId: string;
}

interface TestDrawingAction {
	type: "nextPhase";
}

const handlerPlugin: GamePlugin<TestState, TestAction, Record<string, never>> = {
	id: "test-handler",
	name: "Test Handler",
	minPlayers: 1,
	maxPlayers: 8,
	defaultConfig: {},
	createInitialState: () => ({
		phase: "playing",
		lastPlayerId: null,
	}),
	reduce: (state, action, playerId) => {
		if (action.type === "finish") {
			return { ...state, phase: "gameOver", lastPlayerId: playerId };
		}
		return null;
	},
	validateAction: (state, action) => {
		if (state.phase === "gameOver") {
			return "Game is over";
		}
		return action.type === "finish" ? null : "Unknown action";
	},
	getPlayerView: (state, playerId) => ({
		phase: state.phase,
		playerId,
	}),
	getSpectatorView: (state) => ({
		phase: state.phase,
		spectating: true,
	}),
	getServerActions: () => [],
	isGameOver: (state) => state.phase === "gameOver",
};

const drawingPlugin: GamePlugin<TestDrawingState, TestDrawingAction, Record<string, never>> = {
	id: "test-drawing",
	name: "Test Drawing",
	minPlayers: 1,
	maxPlayers: 8,
	defaultConfig: {},
	createInitialState: (players) => ({
		phase: "showing",
		mode: "drawing",
		currentShowerId: players[0]!.id,
	}),
	reduce: (state, action) => {
		if (action.type === "nextPhase") {
			return { ...state, phase: "starting" };
		}
		return null;
	},
	validateAction: (_state, action) => (action.type === "nextPhase" ? null : "Unknown action"),
	getPlayerView: (state) => state,
	getSpectatorView: (state) => state,
	getServerActions: () => [],
	isGameOver: () => false,
};

function msg(obj: unknown): string {
	return JSON.stringify(obj);
}

function collectMessages(ws: ReturnType<typeof createMockWs>): unknown[] {
	const messages: unknown[] = [];
	(ws as unknown as { send: (data: string) => number }).send = (data: string) => {
		messages.push(JSON.parse(data));
		return 0;
	};
	return messages;
}

describe("handleMessage integration", () => {
	beforeEach(() => {
		registerPlugin(handlerPlugin);
		registerPlugin(drawingPlugin);
	});

	describe("malformed messages", () => {
		test("rejects invalid JSON", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, "not json");

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects unknown message type", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, msg({ type: "hacked" }));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects connect with missing fields", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, msg({ type: "connect" }));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects connect with empty playerName", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, msg({ type: "connect", playerName: "", avatarSeed: 0 }));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects connect with oversized playerName", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(
				ws,
				msg({
					type: "connect",
					playerName: "A".repeat(21),
					avatarSeed: 0,
				}),
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects joinRoom with empty code", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, msg({ type: "joinRoom", roomCode: "" }));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects gameAction with missing action", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, msg({ type: "gameAction" }));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});

		test("rejects binary garbage", () => {
			const ws = createMockWs();
			const messages = collectMessages(ws);

			handleMessage(ws, Buffer.from([0xff, 0xfe, 0x00, 0x01]));

			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				type: "error",
				code: "INVALID_MESSAGE",
			});
		});
	});

	describe("brute-force join protection", () => {
		let player: ServerPlayer;
		let ws: ReturnType<typeof createMockWs>;

		beforeEach(() => {
			ws = createMockWs();
			player = playerManager.create("Attacker", 0, ws);
		});

		afterEach(() => {
			playerManager.remove(player.id);
			// Reset the join rate limiter by creating a fresh one
			// We can't reset the singleton, but the test IP "127.0.0.1"
			// will expire after the window. For testing we use a dedicated limiter.
		});

		test("rate-limits join attempts per IP", () => {
			const limiter = new RateLimiter(3, 60_000, "test-join");
			const ip = "10.0.0.1";

			expect(limiter.check(ip)).toBe(true); // 1
			expect(limiter.check(ip)).toBe(true); // 2
			expect(limiter.check(ip)).toBe(true); // 3
			expect(limiter.check(ip)).toBe(false); // blocked
			expect(limiter.check(ip)).toBe(false); // still blocked

			// Different IP is not affected
			expect(limiter.check("10.0.0.2")).toBe(true);
		});

		test("all failed join attempts return same error code (no oracle)", () => {
			const ws1 = createMockWs();
			const p1 = playerManager.create("P1", 0, ws1);
			const room = roomManager.create(p1.id);

			// Non-existent room
			const result1 = roomManager.join("ZZZZ", player.id);
			expect(result1.error).toBe("JOIN_FAILED");

			// Room in progress
			roomManager.setStatus(room.code, "playing");
			const result2 = roomManager.join(room.code, player.id);
			expect(result2.error).toBe("JOIN_FAILED");

			// Cleanup
			roomManager.setStatus(room.code, "lobby");
			roomManager.leave(room.code, p1.id);
			playerManager.remove(p1.id);
		});

		test("ROOM_FULL and PLAYER_BANNED remain distinguishable", () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const host = playerManager.create("Host", 0, ws1);
			const filler = playerManager.create("Filler", 0, ws2);
			const room = roomManager.create(host.id, { maxPlayers: 2 });
			roomManager.join(room.code, filler.id);

			// Room full
			const result1 = roomManager.join(room.code, player.id);
			expect(result1.error).toBe("ROOM_FULL");

			// Ban
			roomManager.ban(room.code, player.id);
			roomManager.leave(room.code, filler.id);
			const result2 = roomManager.join(room.code, player.id);
			expect(result2.error).toBe("PLAYER_BANNED");

			// Cleanup
			roomManager.leave(room.code, host.id);
			playerManager.remove(host.id);
			playerManager.remove(filler.id);
		});
	});

	describe("gameAction rate limiting", () => {
		test("blocks excessive game actions per player", () => {
			const limiter = new RateLimiter(3, 1_000, "test-gameAction");
			const playerId = "player-123";

			expect(limiter.check(playerId)).toBe(true); // 1
			expect(limiter.check(playerId)).toBe(true); // 2
			expect(limiter.check(playerId)).toBe(true); // 3
			expect(limiter.check(playerId)).toBe(false); // blocked

			// Other player not affected
			expect(limiter.check("player-456")).toBe(true);
		});
	});

	describe("connect rate limiting", () => {
		test("blocks excessive connect attempts per IP", () => {
			const limiter = new RateLimiter(2, 60_000, "test-connect");
			const ip = "10.0.0.99";

			expect(limiter.check(ip)).toBe(true);
			expect(limiter.check(ip)).toBe(true);
			expect(limiter.check(ip)).toBe(false);
		});
	});

	describe("multiplayer lifecycle", () => {
		test("leaveRoom during active game returns remaining players to lobby", () => {
			const hostWs = createMockWs();
			const guestWs = createMockWs();
			const hostMessages = collectMessages(hostWs);
			const guestMessages = collectMessages(guestWs);

			const host = playerManager.create("Host", 0, hostWs);
			const guest = playerManager.create("Guest", 0, guestWs);

			const room = roomManager.create(host.id, { gameId: "test-handler" });
			roomManager.join(room.code, guest.id);

			const players: PlayerInfo[] = [
				playerManager.toPlayerInfo(host),
				playerManager.toPlayerInfo(guest),
			];
			startGame(room.code, "test-handler", players, {});

			handleMessage(guestWs, msg({ type: "leaveRoom" }));

			const updatedRoom = roomManager.get(room.code);
			expect(updatedRoom?.status).toBe("lobby");
			expect(updatedRoom?.playerIds).toEqual([host.id]);
			expect(getEngine(room.code)).toBeNull();
			expect(guest.roomCode).toBeNull();

			expect(guestMessages).toContainEqual({ type: "playerLeft", playerId: guest.id });
			expect(hostMessages).toContainEqual({ type: "playerLeft", playerId: guest.id });
			expect(hostMessages).toContainEqual({
				type: "returnedToLobby",
				room: roomManager.toRoomState(updatedRoom!),
			});

			roomManager.leave(room.code, host.id);
			playerManager.remove(host.id);
			playerManager.remove(guest.id);
		});

		test("reconnect to finished room restores game state even without a live engine", () => {
			const hostWs = createMockWs();
			const host = playerManager.create("Host", 0, hostWs);
			const room = roomManager.create(host.id, { gameId: "test-handler" });
			const players: PlayerInfo[] = [playerManager.toPlayerInfo(host)];
			const { engine } = startGame(room.code, "test-handler", players, {});

			engine!.handleAction(host.id, { type: "finish" });
			expect(roomManager.get(room.code)?.status).toBe("finished");

			destroyEngine(room.code);
			playerManager.disconnect(hostWs);

			const reconnectWs = createMockWs();
			const reconnectMessages = collectMessages(reconnectWs);

			handleMessage(
				reconnectWs,
				msg({
					type: "connect",
					playerName: "Host",
					avatarSeed: 0,
					sessionToken: host.sessionToken,
				}),
			);

			expect(reconnectMessages).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "connected", playerId: host.id, roomCode: room.code }),
					expect.objectContaining({
						type: "roomState",
						room: expect.objectContaining({ code: room.code, status: "finished" }),
					}),
					expect.objectContaining({
						type: "gameState",
						gameState: expect.objectContaining({ phase: "gameOver", playerId: host.id }),
					}),
				]),
			);

			roomManager.leave(room.code, host.id);
			playerManager.remove(host.id);
		});

		test("does not replay stale drawing history after round leaves showing phase", () => {
			const hostWs = createMockWs();
			const host = playerManager.create("Host", 0, hostWs);
			const room = roomManager.create(host.id, { gameId: "test-drawing" });
			const players: PlayerInfo[] = [playerManager.toPlayerInfo(host)];
			const { engine } = startGame(room.code, "test-drawing", players, {});

			handleMessage(
				hostWs,
				msg({
					type: "drawStroke",
					points: [{ x: 0.25, y: 0.5 }],
					newStroke: true,
				}),
			);
			engine!.handleAction(host.id, { type: "nextPhase" });
			playerManager.disconnect(hostWs);

			const reconnectWs = createMockWs();
			const reconnectMessages = collectMessages(reconnectWs);

			handleMessage(
				reconnectWs,
				msg({
					type: "connect",
					playerName: "Host",
					avatarSeed: 0,
					sessionToken: host.sessionToken,
				}),
			);

			expect(
				reconnectMessages.some((message) => (message as { type?: string }).type === "drawHistory"),
			).toBe(false);

			roomManager.leave(room.code, host.id);
			playerManager.remove(host.id);
		});
	});
});
