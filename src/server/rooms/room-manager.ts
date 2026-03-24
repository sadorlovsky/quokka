import {
	ErrorCode,
	MAX_PLAYERS_PER_ROOM,
	MIN_PLAYERS_TO_START,
	ROOM_CODE_CHARS,
	ROOM_CODE_LENGTH,
	ROOM_IDLE_TIMEOUT,
} from "@/shared/constants";
import type { ServerMessage } from "@/shared/types/protocol";
import type { PlayerInfo, RoomSettings, RoomState, RoomStatus } from "@/shared/types/room";
import { DEFAULT_ROOM_SETTINGS } from "@/shared/types/room";
import {
	deletePersistedRoom,
	loadAllRooms,
	persistRoom,
	updatePersistedGameState,
	updatePersistedRoomPlayers,
	updatePersistedRoomSettings,
} from "../storage/sqlite";
import { send } from "../ws/connection";
import { playerManager } from "./player-manager";

interface ServerRoom {
	code: string;
	status: RoomStatus;
	hostId: string;
	playerIds: string[];
	bannedPlayerIds: Set<string>;
	settings: RoomSettings;
	createdAt: number;
	gameState: unknown | null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, Math.floor(value)));
}

function sanitizeGameConfig(
	gameId: string,
	config: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	if (gameId === "word-guess") {
		if ("mode" in config) {
			sanitized.mode = config.mode === "teams" ? "teams" : "ffa";
		}
		if ("roundTimeSeconds" in config) {
			sanitized.roundTimeSeconds = clamp(config.roundTimeSeconds, 10, 300, 60);
		}
		if ("cycles" in config) {
			sanitized.cycles = clamp(config.cycles, 1, 10, 1);
		}
		if ("wordLanguage" in config) {
			sanitized.wordLanguage = config.wordLanguage === "en" ? "en" : "ru";
		}
		if ("difficulty" in config) {
			const d = config.difficulty;
			sanitized.difficulty = d === 1 || d === 2 || d === 3 ? d : "all";
		}
		if ("textMode" in config) {
			sanitized.textMode = config.textMode === true;
		}
		if ("teams" in config && typeof config.teams === "object" && config.teams !== null) {
			sanitized.teams = config.teams;
		}
	} else if (gameId === "tapeworm") {
		if ("handSize" in config) {
			sanitized.handSize = clamp(config.handSize, 3, 8, 5);
		}
	} else if (gameId === "crocodile") {
		if ("mode" in config) {
			sanitized.mode = config.mode === "drawing" ? "drawing" : "gestures";
		}
		if ("roundTimeSeconds" in config) {
			sanitized.roundTimeSeconds = clamp(config.roundTimeSeconds, 30, 180, 60);
		}
		if ("cycles" in config) {
			sanitized.cycles = clamp(config.cycles, 1, 5, 1);
		}
		if ("wordLanguage" in config) {
			sanitized.wordLanguage = config.wordLanguage === "en" ? "en" : "ru";
		}
		if ("difficulty" in config) {
			const d = config.difficulty;
			sanitized.difficulty = d === 1 || d === 2 || d === 3 ? d : "all";
		}
		if ("textMode" in config) {
			sanitized.textMode = config.textMode === true;
		}
	} else if (gameId === "hangman") {
		// No config options — rounds are auto-calculated from player count
	} else {
		// Unknown game — pass through as-is (plugin will merge with defaults)
		return config;
	}

	return sanitized;
}

function generateRoomCode(): string {
	let code = "";
	for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
		code += ROOM_CODE_CHARS[crypto.getRandomValues(new Uint8Array(1))[0]! % ROOM_CODE_CHARS.length];
	}
	return code;
}

class RoomManager {
	private rooms = new Map<string, ServerRoom>();

	create(hostId: string, settings?: Partial<RoomSettings>): ServerRoom {
		let code: string;
		do {
			code = generateRoomCode();
		} while (this.rooms.has(code));

		// Sanitize incoming settings
		if (settings?.maxPlayers !== undefined) {
			settings.maxPlayers = Math.max(
				MIN_PLAYERS_TO_START,
				Math.min(MAX_PLAYERS_PER_ROOM, Math.floor(settings.maxPlayers)),
			);
		}
		if (settings?.gameConfig) {
			const gameId = settings.gameId ?? DEFAULT_ROOM_SETTINGS.gameId;
			settings.gameConfig = sanitizeGameConfig(gameId, settings.gameConfig);
		}

		const room: ServerRoom = {
			code,
			status: "lobby",
			hostId,
			playerIds: [hostId],
			bannedPlayerIds: new Set(),
			settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
			createdAt: Date.now(),
			gameState: null,
		};

		this.rooms.set(code, room);

		persistRoom({
			code,
			status: room.status,
			hostId: room.hostId,
			playerIds: room.playerIds,
			settings: room.settings,
			gameState: null,
			pauseInfo: null,
			createdAt: room.createdAt,
		});

		const player = playerManager.get(hostId);
		if (player) {
			playerManager.setRoomCode(hostId, code);
			if (player.ws) {
				player.ws.subscribe(`room:${code}`);
			}
		}

		return room;
	}

	join(
		roomCode: string,
		playerId: string,
	): { room: ServerRoom; error?: undefined } | { room?: undefined; error: string } {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return { error: ErrorCode.JOIN_FAILED };
		}
		if (room.status === "playing") {
			return { error: ErrorCode.JOIN_FAILED };
		}
		if (room.bannedPlayerIds.has(playerId)) {
			return { error: ErrorCode.PLAYER_BANNED };
		}
		if (room.playerIds.length >= room.settings.maxPlayers) {
			return { error: ErrorCode.ROOM_FULL };
		}
		if (room.playerIds.includes(playerId)) {
			return { error: "ALREADY_IN_ROOM" };
		}

		// Auto-rename on duplicate names (append number)
		const player = playerManager.get(playerId);
		if (player) {
			const existingNames = room.playerIds
				.map((id) => playerManager.get(id))
				.filter(Boolean)
				.map((p) => p!.name.toLowerCase());
			if (existingNames.includes(player.name.toLowerCase())) {
				let suffix = 2;
				while (existingNames.includes(`${player.name.toLowerCase()} ${suffix}`)) {
					suffix++;
				}
				player.name = `${player.name} ${suffix}`;
			}
		}

		room.playerIds.push(playerId);
		updatePersistedRoomPlayers(roomCode, room.playerIds, room.hostId);

		if (player) {
			playerManager.setRoomCode(playerId, roomCode);
			if (player.ws) {
				player.ws.subscribe(`room:${roomCode}`);
			}
		}

		return { room };
	}

	leave(roomCode: string, playerId: string): void {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return;
		}

		room.playerIds = room.playerIds.filter((id) => id !== playerId);

		const player = playerManager.get(playerId);
		if (player) {
			playerManager.setRoomCode(playerId, null);
			if (player.ws) {
				player.ws.unsubscribe(`room:${roomCode}`);
			}
		}

		// In lobby: also remove disconnected players (they can't do anything useful)
		if (room.status === "lobby") {
			const disconnected = room.playerIds.filter((id) => {
				const p = playerManager.get(id);
				return !p || !p.isConnected;
			});
			for (const id of disconnected) {
				room.playerIds = room.playerIds.filter((pid) => pid !== id);
				playerManager.setRoomCode(id, null);
			}
		}

		// If room is empty, destroy it
		if (room.playerIds.length === 0) {
			this.rooms.delete(roomCode);
			deletePersistedRoom(roomCode);
			return;
		}

		// If host left, transfer to next player
		if (room.hostId === playerId) {
			room.hostId = room.playerIds[0]!;
		}

		updatePersistedRoomPlayers(roomCode, room.playerIds, room.hostId);
	}

	updateSettings(
		roomCode: string,
		playerId: string,
		settings: Partial<RoomSettings>,
	): string | null {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return ErrorCode.ROOM_NOT_FOUND;
		}
		if (room.hostId !== playerId) {
			return ErrorCode.NOT_HOST;
		}
		if (room.status !== "lobby") {
			return ErrorCode.ROOM_IN_PROGRESS;
		}

		// Clamp maxPlayers to valid range
		if (settings.maxPlayers !== undefined) {
			settings.maxPlayers = Math.max(
				MIN_PLAYERS_TO_START,
				Math.min(MAX_PLAYERS_PER_ROOM, Math.floor(settings.maxPlayers)),
			);
		}

		// Sanitize gameConfig: clamp known fields per game
		if (settings.gameConfig) {
			const gameId = settings.gameId ?? room.settings.gameId;
			settings.gameConfig = sanitizeGameConfig(gameId, settings.gameConfig);
		}

		room.settings = { ...room.settings, ...settings };
		updatePersistedRoomSettings(roomCode, room.settings);
		return null;
	}

	canStart(roomCode: string, playerId: string): string | null {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return ErrorCode.ROOM_NOT_FOUND;
		}
		if (room.hostId !== playerId) {
			return ErrorCode.NOT_HOST;
		}
		if (room.status !== "lobby") {
			return ErrorCode.ROOM_IN_PROGRESS;
		}
		if (room.playerIds.length < MIN_PLAYERS_TO_START) {
			return ErrorCode.NOT_ENOUGH_PLAYERS;
		}
		const allConnected = room.playerIds.every((id) => playerManager.get(id)?.isConnected);
		if (!allConnected) {
			return ErrorCode.INVALID_ACTION;
		}
		return null;
	}

	ban(roomCode: string, playerId: string): void {
		const room = this.rooms.get(roomCode);
		if (room) {
			room.bannedPlayerIds.add(playerId);
		}
	}

	setStatus(roomCode: string, status: RoomStatus): void {
		const room = this.rooms.get(roomCode);
		if (room) {
			room.status = status;
			updatePersistedGameState(roomCode, status, room.gameState);
		}
	}

	setGameState(roomCode: string, state: unknown): void {
		const room = this.rooms.get(roomCode);
		if (room) {
			room.gameState = state;
			updatePersistedGameState(roomCode, room.status, state);
		}
	}

	get(roomCode: string): ServerRoom | null {
		return this.rooms.get(roomCode) ?? null;
	}

	getPlayerRoom(playerId: string): ServerRoom | null {
		const player = playerManager.get(playerId);
		if (!player?.roomCode) {
			return null;
		}
		return this.rooms.get(player.roomCode) ?? null;
	}

	toRoomState(room: ServerRoom): RoomState {
		const players: PlayerInfo[] = room.playerIds
			.map((id) => {
				const p = playerManager.get(id);
				if (!p) {
					return null;
				}
				return {
					...playerManager.toPlayerInfo(p),
					isHost: id === room.hostId,
				};
			})
			.filter(Boolean) as PlayerInfo[];

		return {
			code: room.code,
			status: room.status,
			hostId: room.hostId,
			players,
			settings: room.settings,
			createdAt: room.createdAt,
		};
	}

	broadcast(
		roomCode: string,
		message: ServerMessage,
		server: { publish: (topic: string, data: string) => void },
	): void {
		server.publish(`room:${roomCode}`, JSON.stringify(message));
	}

	sendToPlayer(playerId: string, message: ServerMessage): void {
		const player = playerManager.get(playerId);
		if (player?.ws && player.isConnected) {
			send(player.ws, message);
		}
	}

	sendToRoom(roomCode: string, message: ServerMessage): void {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return;
		}

		for (const playerId of room.playerIds) {
			this.sendToPlayer(playerId, message);
		}
	}

	sendToRoomExcept(roomCode: string, exceptPlayerId: string, message: ServerMessage): void {
		const room = this.rooms.get(roomCode);
		if (!room) {
			return;
		}

		for (const playerId of room.playerIds) {
			if (playerId !== exceptPlayerId) {
				this.sendToPlayer(playerId, message);
			}
		}
	}

	cleanup(): number {
		const now = Date.now();
		let removed = 0;

		for (const [code, room] of this.rooms) {
			const allDisconnected = room.playerIds.every((id) => {
				const player = playerManager.get(id);
				return !player || !player.isConnected;
			});

			if (!allDisconnected) {
				continue;
			}

			// Find the most recent heartbeat among all players
			const lastActivity = room.playerIds.reduce((latest, id) => {
				const player = playerManager.get(id);
				return player ? Math.max(latest, player.lastHeartbeat) : latest;
			}, room.createdAt);

			if (now - lastActivity > ROOM_IDLE_TIMEOUT) {
				// Clean up player references
				for (const id of room.playerIds) {
					playerManager.remove(id);
				}
				this.rooms.delete(code);
				deletePersistedRoom(code);
				removed++;
			}
		}

		return removed;
	}

	restore(): number {
		const rows = loadAllRooms();
		for (const row of rows) {
			const room: ServerRoom = {
				code: row.code,
				status: row.status as RoomStatus,
				hostId: row.host_id,
				playerIds: JSON.parse(row.player_ids_json),
				bannedPlayerIds: new Set(),
				settings: JSON.parse(row.settings_json),
				createdAt: row.created_at,
				gameState: row.game_state_json ? JSON.parse(row.game_state_json) : null,
			};
			this.rooms.set(room.code, room);
		}
		return rows.length;
	}

	startCleanup(intervalMs = 60_000): void {
		setInterval(() => {
			const removed = this.cleanup();
			if (removed > 0) {
				console.log(`[cleanup] removed ${removed} idle room(s), ${this.rooms.size} remaining`);
			}
		}, intervalMs);
	}

	get count(): number {
		return this.rooms.size;
	}
}

export const roomManager = new RoomManager();
export type { ServerRoom };
