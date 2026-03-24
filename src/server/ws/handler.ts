import type { ServerWebSocket } from "bun";
import { ErrorCode } from "@/shared/constants";
import type { ClientMessage } from "@/shared/types/protocol";
import { destroyEngine, getEngine, startGame } from "../games/engine";
import { getPlugin } from "../games/registry";
import { playerManager } from "../rooms/player-manager";
import { roomManager } from "../rooms/room-manager";
import { parseMessage, send, sendError, type WSData } from "./connection";
import {
	chatRateLimiter,
	connectRateLimiter,
	drawStrokeRateLimiter,
	gameActionRateLimiter,
	joinRateLimiter,
} from "./rate-limit";

// In-memory drawing strokes per room (for reconnect replay)
const drawingStrokes = new Map<string, { x: number; y: number }[][]>();

export function clearDrawingStrokes(roomCode: string): void {
	drawingStrokes.delete(roomCode);
}

export function getDrawingStrokes(roomCode: string): { x: number; y: number }[][] | undefined {
	return drawingStrokes.get(roomCode);
}

export function handleOpen(_ws: ServerWebSocket<WSData>): void {
	console.log("[ws] new connection");
}

export function handleMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): void {
	const msg = parseMessage(raw);
	if (!msg) {
		console.warn(`[security] invalid message from ip=${ws.remoteAddress}`);
		sendError(ws, ErrorCode.INVALID_MESSAGE, "Invalid message format");
		return;
	}

	try {
		switch (msg.type) {
			case "connect":
				handleConnect(ws, msg);
				break;
			case "heartbeat":
				playerManager.heartbeat(ws);
				break;
			case "createRoom":
				handleCreateRoom(ws, msg);
				break;
			case "joinRoom":
				handleJoinRoom(ws, msg);
				break;
			case "leaveRoom":
				handleLeaveRoom(ws);
				break;
			case "updateSettings":
				handleUpdateSettings(ws, msg);
				break;
			case "startGame":
				handleStartGame(ws);
				break;
			case "gameAction":
				handleGameAction(ws, msg);
				break;
			case "returnToLobby":
				handleReturnToLobby(ws);
				break;
			case "endGame":
				handleEndGame(ws);
				break;
			case "switchTeam":
				handleSwitchTeam(ws, msg);
				break;
			case "kickPlayer":
				handleKickPlayer(ws, msg);
				break;
			case "drawStroke":
				handleDrawStroke(ws, msg);
				break;
			case "drawClear":
				handleDrawClear(ws);
				break;
			case "drawUndo":
				handleDrawUndo(ws);
				break;
			case "chatMessage":
				handleChatMessage(ws, msg);
				break;
			default:
				sendError(ws, ErrorCode.INVALID_MESSAGE, "Unknown message type");
		}
	} catch (error) {
		console.error("[ws] handler error:", error);
		sendError(ws, ErrorCode.INVALID_MESSAGE, "Internal error processing message");
	}
}

function sendCurrentGameState(
	ws: ServerWebSocket<WSData>,
	room: ReturnType<typeof roomManager.get>,
	playerId: string,
): void {
	if (!room) {
		return;
	}

	const engine = getEngine(room.code);
	if (engine) {
		const state = engine.getState();
		if (!state) {
			return;
		}

		send(ws, {
			type: "gameState",
			gameState: engine.getPlugin().getPlayerView(state, playerId),
		});
		return;
	}

	if (!room.gameState) {
		return;
	}

	const plugin = getPlugin(room.settings.gameId);
	if (!plugin) {
		return;
	}

	send(ws, {
		type: "gameState",
		gameState: plugin.getPlayerView(room.gameState, playerId),
	});
}

function getLiveGameState(
	room: ReturnType<typeof roomManager.get>,
): Record<string, unknown> | null {
	if (!room) {
		return null;
	}

	const engine = getEngine(room.code);
	const state = (engine?.getState() ?? room.gameState) as Record<string, unknown> | null;
	return state && typeof state === "object" ? state : null;
}

function shouldReplayDrawingHistory(room: ReturnType<typeof roomManager.get>): boolean {
	const state = getLiveGameState(room);
	return state?.mode === "drawing" && state.phase === "showing";
}

function removePlayerFromRoom(
	playerId: string,
	notifySelf: "left" | "kicked" | "none" = "left",
): void {
	const player = playerManager.get(playerId);
	if (!player?.roomCode) {
		return;
	}

	const roomCode = player.roomCode;
	const roomBefore = roomManager.get(roomCode);
	const wasPlaying = roomBefore?.status === "playing";

	if (notifySelf === "left" && player.ws) {
		send(player.ws, { type: "playerLeft", playerId });
	} else if (notifySelf === "kicked" && player.ws) {
		send(player.ws, { type: "playerKicked", playerId });
	}

	roomManager.leave(roomCode, playerId);

	const roomAfter = roomManager.get(roomCode);

	if (wasPlaying) {
		destroyEngine(roomCode);
		clearDrawingStrokes(roomCode);

		if (!roomAfter) {
			return;
		}

		roomManager.setStatus(roomCode, "lobby");
		roomManager.setGameState(roomCode, null);

		roomManager.sendToRoom(roomCode, {
			type: "playerLeft",
			playerId,
		});
		roomManager.sendToRoom(roomCode, {
			type: "returnedToLobby",
			room: roomManager.toRoomState(roomAfter),
		});
		return;
	}

	if (!roomAfter) {
		return;
	}

	roomManager.sendToRoom(roomCode, {
		type: "playerLeft",
		playerId,
	});
	roomManager.sendToRoom(roomCode, {
		type: "roomState",
		room: roomManager.toRoomState(roomAfter),
	});
}

function handleConnect(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "connect" }>,
): void {
	const ip = ws.remoteAddress;
	if (process.env.NODE_ENV === "production" && !connectRateLimiter.check(ip)) {
		sendError(ws, ErrorCode.RATE_LIMITED, "Too many connection attempts");
		return;
	}

	// Try reconnect with existing session
	if (msg.sessionToken) {
		const existing = playerManager.getBySession(msg.sessionToken);
		if (existing) {
			// Old WS hasn't closed yet (page refresh race) — force-disconnect it
			if (existing.isConnected && existing.ws) {
				const oldWs = existing.ws;
				playerManager.disconnect(oldWs);
				oldWs.close();
			}

			const player = playerManager.reconnect(msg.sessionToken, ws);
			if (player) {
				player.avatarSeed = msg.avatarSeed;

				// Check if the room still exists before telling client about it
				if (player.roomCode && !roomManager.get(player.roomCode)) {
					playerManager.setRoomCode(player.id, null);
				}

				send(ws, {
					type: "connected",
					playerId: player.id,
					sessionToken: player.sessionToken,
					roomCode: player.roomCode ?? undefined,
				});

				// If player was in a room, rejoin and send full state
				if (player.roomCode) {
					const room = roomManager.get(player.roomCode)!;
					ws.subscribe(`room:${room.code}`);

					roomManager.sendToRoom(room.code, {
						type: "playerReconnected",
						playerId: player.id,
					});

					send(ws, {
						type: "roomState",
						room: roomManager.toRoomState(room),
					});

					if (room.status === "playing") {
						const engine = getEngine(room.code);
						if (engine) {
							engine.resume(player.id);
							sendCurrentGameState(ws, room, player.id);
							if (engine.isPaused()) {
								const pauseInfo = engine.getPauseInfo();
								if (pauseInfo) {
									send(ws, { type: "gamePaused", pauseInfo });
								}
							}
						} else {
							sendCurrentGameState(ws, room, player.id);
						}

						// Send drawing history for reconnect
						const strokes = getDrawingStrokes(room.code);
						if (strokes && strokes.length > 0 && shouldReplayDrawingHistory(room)) {
							send(ws, { type: "drawHistory", strokes });
						}
					} else if (room.status === "finished") {
						sendCurrentGameState(ws, room, player.id);
					}
				}

				console.log(`[ws] player reconnected: ${player.name} (${player.id})`);
				return;
			}
		}
	}

	// New connection
	const player = playerManager.create(msg.playerName, msg.avatarSeed, ws);

	send(ws, {
		type: "connected",
		playerId: player.id,
		sessionToken: player.sessionToken,
	});

	console.log(`[ws] player connected: ${player.name} (${player.id})`);
}

function handleCreateRoom(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "createRoom" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player) {
		return;
	}

	// Leave current room if in one
	if (player.roomCode) {
		handleLeaveRoom(ws);
	}

	const room = roomManager.create(player.id, msg.settings);

	send(ws, {
		type: "roomCreated",
		room: roomManager.toRoomState(room),
	});

	console.log(`[ws] room created: ${room.code} by ${player.name}`);
}

function handleJoinRoom(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "joinRoom" }>,
): void {
	const ip = ws.remoteAddress;
	if (process.env.NODE_ENV === "production" && !joinRateLimiter.check(ip)) {
		sendError(ws, ErrorCode.RATE_LIMITED, "Too many join attempts");
		return;
	}

	const player = playerManager.getByWs(ws);
	if (!player) {
		return;
	}

	// Leave current room if in one
	if (player.roomCode) {
		handleLeaveRoom(ws);
	}

	const code = msg.roomCode.toUpperCase();
	const result = roomManager.join(code, player.id);

	if (result.error || !result.room) {
		console.warn(
			`[security] failed join: code=${code} error=${result.error} ip=${ws.remoteAddress}`,
		);
		sendError(ws, result.error ?? "UNKNOWN", `Cannot join room`);
		return;
	}

	const room = result.room;

	// Send full room state to joining player FIRST
	send(ws, {
		type: "roomJoined",
		room: roomManager.toRoomState(room),
	});

	// Notify OTHER players about the new player
	for (const pid of room.playerIds) {
		if (pid === player.id) {
			continue;
		}
		roomManager.sendToPlayer(pid, {
			type: "playerJoined",
			player: {
				...playerManager.toPlayerInfo(player),
				isHost: false,
			},
		});
	}

	console.log(`[ws] ${player.name} joined room ${room.code}`);
}

function handleLeaveRoom(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const roomCode = player.roomCode;
	removePlayerFromRoom(player.id, "left");
	console.log(`[ws] ${player.name} left room ${roomCode}`);
}

function handleUpdateSettings(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "updateSettings" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const error = roomManager.updateSettings(player.roomCode, player.id, msg.settings);
	if (error) {
		sendError(ws, error, `Cannot update settings: ${error}`);
		return;
	}

	const room = roomManager.get(player.roomCode)!;
	roomManager.sendToRoom(player.roomCode, {
		type: "settingsUpdated",
		settings: room.settings,
	});
}

function handleStartGame(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const error = roomManager.canStart(player.roomCode, player.id);
	if (error) {
		sendError(ws, error, `Cannot start game: ${error}`);
		return;
	}

	const room = roomManager.get(player.roomCode)!;
	const players = room.playerIds
		.map((id) => playerManager.get(id))
		.filter(Boolean)
		.map((p) => playerManager.toPlayerInfo(p!));

	const result = startGame(room.code, room.settings.gameId, players, room.settings.gameConfig);

	if (result.error) {
		sendError(ws, ErrorCode.GAME_NOT_FOUND, result.error);
		return;
	}

	console.log(`[ws] game started in room ${room.code}`);
}

function handleGameAction(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "gameAction" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	if (!gameActionRateLimiter.check(player.id)) {
		sendError(ws, ErrorCode.RATE_LIMITED, "Too many actions");
		return;
	}

	const engine = getEngine(player.roomCode);
	if (!engine) {
		sendError(ws, ErrorCode.GAME_NOT_STARTED, "No active game");
		return;
	}

	const stateBefore = engine.getState() as { phase?: string; mode?: string } | null;
	const phaseBefore = stateBefore?.phase;

	const result = engine.handleAction(player.id, msg.action);

	// Clear drawing strokes on round change (phase transitions to "starting" or "gameOver")
	if (result.success && stateBefore?.mode === "drawing") {
		const stateAfter = engine.getState() as { phase?: string } | null;
		if (
			stateAfter?.phase !== phaseBefore &&
			(stateAfter?.phase === "starting" || stateAfter?.phase === "gameOver")
		) {
			clearDrawingStrokes(player.roomCode);
			roomManager.sendToRoom(player.roomCode, { type: "drawClear" });
		}
	}

	send(ws, {
		type: "gameActionResult",
		success: result.success,
		error: result.error,
	});
}

function handleSwitchTeam(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "switchTeam" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room) {
		return;
	}

	if (room.status !== "lobby") {
		sendError(ws, ErrorCode.ROOM_IN_PROGRESS, "Game is in progress");
		return;
	}

	const gameConfig = room.settings.gameConfig as Record<string, unknown>;
	const teams = gameConfig.teams as Record<string, string[]> | undefined;
	if (!teams || !teams[msg.teamId]) {
		sendError(ws, ErrorCode.INVALID_ACTION, "Invalid team");
		return;
	}

	// Already in this team
	if (teams[msg.teamId]!.includes(player.id)) {
		return;
	}

	// Remove from all teams, add to target
	const updated: Record<string, string[]> = {};
	for (const [tid, members] of Object.entries(teams)) {
		updated[tid] = members.filter((id) => id !== player.id);
	}
	updated[msg.teamId] = [...updated[msg.teamId]!, player.id];

	const newSettings = {
		...room.settings,
		gameConfig: { ...gameConfig, teams: updated },
	};
	room.settings = newSettings;

	roomManager.sendToRoom(room.code, {
		type: "settingsUpdated",
		settings: newSettings,
	});
}

function handleKickPlayer(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "kickPlayer" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room) {
		return;
	}

	if (room.hostId !== player.id) {
		sendError(ws, ErrorCode.NOT_HOST, "Only host can kick players");
		return;
	}

	if (msg.targetPlayerId === player.id) {
		sendError(ws, ErrorCode.INVALID_ACTION, "Cannot kick yourself");
		return;
	}

	if (!room.playerIds.includes(msg.targetPlayerId)) {
		sendError(ws, ErrorCode.INVALID_ACTION, "Player not in room");
		return;
	}

	const targetPlayer = playerManager.get(msg.targetPlayerId);
	removePlayerFromRoom(msg.targetPlayerId, "kicked");

	console.log(
		`[ws] ${player.name} kicked ${targetPlayer?.name ?? msg.targetPlayerId} from room ${room.code}`,
	);
}

function handleEndGame(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room) {
		return;
	}

	if (room.hostId !== player.id) {
		sendError(ws, ErrorCode.NOT_HOST, "Only host can end the game");
		return;
	}

	if (room.status !== "playing") {
		sendError(ws, ErrorCode.INVALID_ACTION, "Game is not in progress");
		return;
	}

	destroyEngine(room.code);
	clearDrawingStrokes(room.code);
	roomManager.setStatus(room.code, "lobby");
	roomManager.setGameState(room.code, null);

	const updatedRoom = roomManager.get(room.code)!;
	roomManager.sendToRoom(room.code, {
		type: "returnedToLobby",
		room: roomManager.toRoomState(updatedRoom),
	});

	console.log(`[ws] host ended game in room ${room.code}`);
}

function handleReturnToLobby(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room) {
		return;
	}

	if (room.hostId !== player.id) {
		sendError(ws, ErrorCode.NOT_HOST, "Only host can return to lobby");
		return;
	}

	if (room.status !== "finished") {
		sendError(ws, "NOT_FINISHED", "Game is not finished");
		return;
	}

	destroyEngine(room.code);
	clearDrawingStrokes(room.code);
	roomManager.setStatus(room.code, "lobby");
	roomManager.setGameState(room.code, null);

	const updatedRoom = roomManager.get(room.code)!;
	roomManager.sendToRoom(room.code, {
		type: "returnedToLobby",
		room: roomManager.toRoomState(updatedRoom),
	});

	console.log(`[ws] room ${room.code} returned to lobby`);
}

function handleDrawStroke(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "drawStroke" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	if (!drawStrokeRateLimiter.check(player.id)) {
		return; // Silently drop — no error to avoid flooding
	}

	const room = roomManager.get(player.roomCode);
	if (!room || room.status !== "playing") {
		return;
	}

	// Verify this player is the shower in drawing mode
	const engine = getEngine(player.roomCode);
	if (!engine) {
		return;
	}
	const state = engine.getState() as {
		currentShowerId?: string;
		mode?: string;
		phase?: string;
	} | null;
	if (
		!state ||
		state.currentShowerId !== player.id ||
		state.mode !== "drawing" ||
		state.phase !== "showing"
	) {
		return;
	}

	// Store stroke for reconnect replay
	if (!drawingStrokes.has(player.roomCode)) {
		drawingStrokes.set(player.roomCode, []);
	}
	const strokes = drawingStrokes.get(player.roomCode)!;
	if (msg.newStroke || strokes.length === 0) {
		strokes.push([...msg.points]);
	} else {
		const last = strokes[strokes.length - 1]!;
		last.push(...msg.points);
	}

	// Relay to everyone except sender
	roomManager.sendToRoomExcept(player.roomCode, player.id, {
		type: "drawStroke",
		points: msg.points,
		newStroke: msg.newStroke,
	});
}

function handleDrawClear(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room || room.status !== "playing") {
		return;
	}

	const engine = getEngine(player.roomCode);
	if (!engine) {
		return;
	}
	const state = engine.getState() as {
		currentShowerId?: string;
		mode?: string;
		phase?: string;
	} | null;
	if (!state || state.currentShowerId !== player.id || state.mode !== "drawing") {
		return;
	}

	// Clear stored strokes
	drawingStrokes.delete(player.roomCode);

	// Relay to everyone except sender
	roomManager.sendToRoomExcept(player.roomCode, player.id, { type: "drawClear" });
}

function handleDrawUndo(ws: ServerWebSocket<WSData>): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	const room = roomManager.get(player.roomCode);
	if (!room || room.status !== "playing") {
		return;
	}

	const engine = getEngine(player.roomCode);
	if (!engine) {
		return;
	}
	const state = engine.getState() as { currentShowerId?: string; mode?: string } | null;
	if (!state || state.currentShowerId !== player.id || state.mode !== "drawing") {
		return;
	}

	const strokes = drawingStrokes.get(player.roomCode);
	if (strokes && strokes.length > 0) {
		strokes.pop();
	}

	roomManager.sendToRoomExcept(player.roomCode, player.id, { type: "drawUndo" });
}

function handleChatMessage(
	ws: ServerWebSocket<WSData>,
	msg: Extract<ClientMessage, { type: "chatMessage" }>,
): void {
	const player = playerManager.getByWs(ws);
	if (!player?.roomCode) {
		return;
	}

	if (!chatRateLimiter.check(player.id)) {
		return;
	}

	roomManager.sendToRoom(player.roomCode, {
		type: "chatBroadcast",
		playerId: player.id,
		playerName: player.name,
		text: msg.text,
		timestamp: Date.now(),
	});
}

export function handleClose(ws: ServerWebSocket<WSData>, code: number, _reason: string): void {
	const player = playerManager.disconnect(ws);
	if (!player) {
		return;
	}

	// Notify room about disconnection (not removal — player can reconnect)
	if (player.roomCode) {
		roomManager.sendToRoom(player.roomCode, {
			type: "playerDisconnected",
			playerId: player.id,
		});

		// Pause game if in progress
		const room = roomManager.get(player.roomCode);
		if (room?.status === "playing") {
			const engine = getEngine(player.roomCode);
			if (engine) {
				engine.pause(player.id);
			}
		}
	}

	console.log(`[ws] player disconnected: ${player.name} (${code})`);
}
