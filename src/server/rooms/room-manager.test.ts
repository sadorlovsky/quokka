import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ErrorCode, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from "@/shared/constants";
import { createMockWs } from "../__tests__/helpers";
import type { ServerPlayer } from "./player-manager";
import { playerManager } from "./player-manager";
import { roomManager } from "./room-manager";

describe("RoomManager", () => {
	let host: ServerPlayer;
	let player2: ServerPlayer;
	let player3: ServerPlayer;

	beforeEach(() => {
		host = playerManager.create("Host", 0, createMockWs());
		player2 = playerManager.create("Player2", 0, createMockWs());
		player3 = playerManager.create("Player3", 0, createMockWs());
	});

	afterEach(() => {
		// Clean up rooms first (leave removes room references)
		for (const p of [host, player2, player3]) {
			if (p.roomCode) {
				roomManager.leave(p.roomCode, p.id);
			}
		}
		playerManager.remove(host.id);
		playerManager.remove(player2.id);
		playerManager.remove(player3.id);
	});

	describe("create", () => {
		test("creates room with valid code", () => {
			const room = roomManager.create(host.id);

			expect(room.code).toHaveLength(ROOM_CODE_LENGTH);
			for (const char of room.code) {
				expect(ROOM_CODE_CHARS).toContain(char);
			}
		});

		test("creates room in lobby status", () => {
			const room = roomManager.create(host.id);
			expect(room.status).toBe("lobby");
		});

		test("adds host to playerIds", () => {
			const room = roomManager.create(host.id);

			expect(room.hostId).toBe(host.id);
			expect(room.playerIds).toContain(host.id);
			expect(room.playerIds).toHaveLength(1);
		});

		test("sets player roomCode", () => {
			const room = roomManager.create(host.id);
			expect(host.roomCode).toBe(room.code);
		});

		test("applies custom settings", () => {
			const room = roomManager.create(host.id, {
				maxPlayers: 4,
			});

			expect(room.settings.maxPlayers).toBe(4);
		});

		test("clamps maxPlayers on create", () => {
			const room = roomManager.create(host.id, { maxPlayers: 999 });
			expect(room.settings.maxPlayers).toBe(12);
		});

		test("sanitizes gameConfig on create", () => {
			const room = roomManager.create(host.id, {
				gameConfig: { roundTimeSeconds: 99999, injectedField: "evil" },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(300);
			expect(room.settings.gameConfig.injectedField).toBeUndefined();
		});

		test("generates unique codes", () => {
			const codes = new Set<string>();
			const rooms = [];
			for (let i = 0; i < 20; i++) {
				const p = playerManager.create(`P${i}`, 0, createMockWs());
				const r = roomManager.create(p.id);
				codes.add(r.code);
				rooms.push({ player: p, room: r });
			}
			expect(codes.size).toBe(20);

			// Cleanup
			for (const { player, room } of rooms) {
				roomManager.leave(room.code, player.id);
				playerManager.remove(player.id);
			}
		});
	});

	describe("join", () => {
		test("adds player to room", () => {
			const room = roomManager.create(host.id);
			const result = roomManager.join(room.code, player2.id);

			expect(result.error).toBeUndefined();
			expect(result.room).toBeDefined();
			expect(result.room!.playerIds).toContain(player2.id);
			expect(player2.roomCode).toBe(room.code);
		});

		test("returns JOIN_FAILED for invalid code", () => {
			const result = roomManager.join("ZZZZ", player2.id);
			expect(result.error).toBe(ErrorCode.JOIN_FAILED);
		});

		test("returns ROOM_FULL when at capacity", () => {
			const room = roomManager.create(host.id, { maxPlayers: 2 });
			roomManager.join(room.code, player2.id);

			const result = roomManager.join(room.code, player3.id);
			expect(result.error).toBe(ErrorCode.ROOM_FULL);
		});

		test("returns JOIN_FAILED when game in progress", () => {
			const room = roomManager.create(host.id);
			roomManager.setStatus(room.code, "playing");

			const result = roomManager.join(room.code, player2.id);
			expect(result.error).toBe(ErrorCode.JOIN_FAILED);
		});

		test("returns error when already in room", () => {
			const room = roomManager.create(host.id);
			const result = roomManager.join(room.code, host.id);
			expect(result.error).toBe("ALREADY_IN_ROOM");
		});

		test("auto-renames duplicate names", () => {
			const room = roomManager.create(host.id);
			// Create a player with same name as host
			const duplicate = playerManager.create("Host", 0, createMockWs());
			roomManager.join(room.code, duplicate.id);

			expect(duplicate.name).toBe("Host 2");

			roomManager.leave(room.code, duplicate.id);
			playerManager.remove(duplicate.id);
		});
	});

	describe("leave", () => {
		test("removes player from room", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			roomManager.leave(room.code, player2.id);

			expect(room.playerIds).not.toContain(player2.id);
			expect(player2.roomCode).toBeNull();
		});

		test("transfers host when host leaves", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			roomManager.leave(room.code, host.id);

			expect(room.hostId).toBe(player2.id);
		});

		test("destroys room when last player leaves", () => {
			const room = roomManager.create(host.id);
			const code = room.code;

			roomManager.leave(code, host.id);

			expect(roomManager.get(code)).toBeNull();
		});

		test("does nothing for invalid room code", () => {
			// Should not throw
			roomManager.leave("ZZZZ", host.id);
		});
	});

	describe("updateSettings", () => {
		test("updates settings when called by host in lobby", () => {
			const room = roomManager.create(host.id);
			const error = roomManager.updateSettings(room.code, host.id, {
				maxPlayers: 6,
			});

			expect(error).toBeNull();
			expect(room.settings.maxPlayers).toBe(6);
		});

		test("returns NOT_HOST when called by non-host", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			const error = roomManager.updateSettings(room.code, player2.id, {
				maxPlayers: 6,
			});
			expect(error).toBe(ErrorCode.NOT_HOST);
		});

		test("returns ROOM_IN_PROGRESS when not in lobby", () => {
			const room = roomManager.create(host.id);
			roomManager.setStatus(room.code, "playing");

			const error = roomManager.updateSettings(room.code, host.id, {
				maxPlayers: 6,
			});
			expect(error).toBe(ErrorCode.ROOM_IN_PROGRESS);
		});

		test("returns ROOM_NOT_FOUND for invalid code", () => {
			const error = roomManager.updateSettings("ZZZZ", host.id, {
				maxPlayers: 6,
			});
			expect(error).toBe(ErrorCode.ROOM_NOT_FOUND);
		});

		test("clamps maxPlayers to valid range (too high)", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, { maxPlayers: 999 });
			expect(room.settings.maxPlayers).toBe(12);
		});

		test("clamps maxPlayers to valid range (too low)", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, { maxPlayers: 0 });
			expect(room.settings.maxPlayers).toBe(2);
		});

		test("clamps maxPlayers to valid range (float)", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, { maxPlayers: 5.9 });
			expect(room.settings.maxPlayers).toBe(5);
		});

		test("sanitizes word-guess gameConfig: clamps roundTimeSeconds", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { roundTimeSeconds: 99999 },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(300);
		});

		test("sanitizes word-guess gameConfig: clamps cycles", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { cycles: -5 },
			});
			expect(room.settings.gameConfig.cycles).toBe(1);
		});

		test("sanitizes word-guess gameConfig: rejects invalid difficulty", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { difficulty: "hacked" },
			});
			expect(room.settings.gameConfig.difficulty).toBe("all");
		});

		test("sanitizes word-guess gameConfig: rejects invalid mode", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { mode: "hacked" },
			});
			expect(room.settings.gameConfig.mode).toBe("ffa");
		});

		test("sanitizes word-guess gameConfig: strips unknown fields", () => {
			const room = roomManager.create(host.id);
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { roundTimeSeconds: 30, injectedField: "evil" },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(30);
			expect(room.settings.gameConfig.injectedField).toBeUndefined();
		});

		test("sanitizes tapeworm gameConfig: clamps handSize", () => {
			const room = roomManager.create(host.id, { gameId: "tapeworm" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { handSize: 100 },
			});
			expect(room.settings.gameConfig.handSize).toBe(8);
		});

		test("sanitizes crocodile gameConfig: clamps roundTimeSeconds", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { roundTimeSeconds: 999 },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(180);
		});

		test("sanitizes crocodile gameConfig: clamps roundTimeSeconds min", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { roundTimeSeconds: 5 },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(30);
		});

		test("sanitizes crocodile gameConfig: clamps cycles", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { cycles: 99 },
			});
			expect(room.settings.gameConfig.cycles).toBe(5);
		});

		test("sanitizes crocodile gameConfig: validates difficulty", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { difficulty: "invalid" },
			});
			expect(room.settings.gameConfig.difficulty).toBe("all");
		});

		test("sanitizes crocodile gameConfig: validates wordLanguage", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { wordLanguage: "fr" },
			});
			expect(room.settings.gameConfig.wordLanguage).toBe("ru");
		});

		test("sanitizes crocodile gameConfig: strips unknown fields", () => {
			const room = roomManager.create(host.id, { gameId: "crocodile" });
			roomManager.updateSettings(room.code, host.id, {
				gameConfig: { roundTimeSeconds: 90, injectedField: "evil" },
			});
			expect(room.settings.gameConfig.roundTimeSeconds).toBe(90);
			expect(room.settings.gameConfig.injectedField).toBeUndefined();
		});
	});

	describe("canStart", () => {
		test("returns null when conditions are met", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			expect(roomManager.canStart(room.code, host.id)).toBeNull();
		});

		test("returns NOT_HOST for non-host", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			expect(roomManager.canStart(room.code, player2.id)).toBe(ErrorCode.NOT_HOST);
		});

		test("returns NOT_ENOUGH_PLAYERS with only 1 player", () => {
			const room = roomManager.create(host.id);

			expect(roomManager.canStart(room.code, host.id)).toBe(ErrorCode.NOT_ENOUGH_PLAYERS);
		});

		test("returns ROOM_IN_PROGRESS when not in lobby", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);
			roomManager.setStatus(room.code, "playing");

			expect(roomManager.canStart(room.code, host.id)).toBe(ErrorCode.ROOM_IN_PROGRESS);
		});

		test("returns ROOM_NOT_FOUND for invalid code", () => {
			expect(roomManager.canStart("ZZZZ", host.id)).toBe(ErrorCode.ROOM_NOT_FOUND);
		});
	});

	describe("setStatus / setGameState", () => {
		test("setStatus updates room status", () => {
			const room = roomManager.create(host.id);
			roomManager.setStatus(room.code, "playing");
			expect(room.status).toBe("playing");
		});

		test("setGameState updates game state", () => {
			const room = roomManager.create(host.id);
			const state = { round: 1 };
			roomManager.setGameState(room.code, state);
			expect(room.gameState).toBe(state);
		});
	});

	describe("get / getPlayerRoom", () => {
		test("get returns room by code", () => {
			const room = roomManager.create(host.id);
			expect(roomManager.get(room.code)).toBe(room);
		});

		test("get returns null for unknown code", () => {
			expect(roomManager.get("ZZZZ")).toBeNull();
		});

		test("getPlayerRoom returns room containing player", () => {
			const room = roomManager.create(host.id);
			expect(roomManager.getPlayerRoom(host.id)).toBe(room);
		});

		test("getPlayerRoom returns null for player not in room", () => {
			expect(roomManager.getPlayerRoom(player2.id)).toBeNull();
		});
	});

	describe("toRoomState", () => {
		test("converts to public RoomState", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);

			const state = roomManager.toRoomState(room);

			expect(state.code).toBe(room.code);
			expect(state.status).toBe("lobby");
			expect(state.hostId).toBe(host.id);
			expect(state.players).toHaveLength(2);

			const hostInfo = state.players.find((p) => p.id === host.id);
			expect(hostInfo?.isHost).toBe(true);
			expect(hostInfo?.name).toBe("Host");

			const p2Info = state.players.find((p) => p.id === player2.id);
			expect(p2Info?.isHost).toBe(false);
		});
	});

	describe("count", () => {
		test("reflects number of rooms", () => {
			const initial = roomManager.count;

			const room = roomManager.create(host.id);
			expect(roomManager.count).toBe(initial + 1);

			roomManager.leave(room.code, host.id);
			expect(roomManager.count).toBe(initial);
		});
	});

	describe("canStart", () => {
		test("rejects start when a player is offline", () => {
			const room = roomManager.create(host.id);
			roomManager.join(room.code, player2.id);
			playerManager.disconnect(player2.ws!);

			expect(roomManager.canStart(room.code, host.id)).toBe(ErrorCode.INVALID_ACTION);
		});
	});
});
