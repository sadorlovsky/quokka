import { PAUSE_TIMEOUT_MS } from "@/shared/constants";
import type { GamePlugin, PauseInfo } from "@/shared/types/game";
import type { PlayerInfo } from "@/shared/types/room";
import { playerManager } from "../rooms/player-manager";
import { roomManager } from "../rooms/room-manager";
import { updatePersistedPauseInfo } from "../storage/sqlite";
import { getPlugin } from "./registry";

export class GameEngine {
	private plugin: GamePlugin;
	private state: unknown;
	private roomCode: string;
	private timerHandle: ReturnType<typeof setTimeout> | null = null;
	private lastTimerKey: string | null = null;

	// Pause state
	private paused = false;
	private pauseInfo: PauseInfo | null = null;
	private pauseTimerHandle: ReturnType<typeof setTimeout> | null = null;
	private savedTimerRemaining: number | null = null;

	constructor(plugin: GamePlugin, roomCode: string) {
		this.plugin = plugin;
		this.state = null;
		this.roomCode = roomCode;
	}

	start(players: PlayerInfo[], config: unknown): void {
		this.state = this.plugin.createInitialState(players, config);
		roomManager.setGameState(this.roomCode, this.state);
		roomManager.setStatus(this.roomCode, "playing");
		this.broadcastState();
		this.processServerActions();
		this.syncTimer();
	}

	handleAction(playerId: string, action: unknown): { success: boolean; error?: string } {
		if (!this.state) {
			return { success: false, error: "Game not started" };
		}

		// Block all actions while paused (except server timeout which we handle separately)
		if (this.paused && playerId !== "__server__") {
			return { success: false, error: "Game is paused" };
		}

		const validationError = this.plugin.validateAction(this.state, action, playerId);
		if (validationError) {
			return { success: false, error: validationError };
		}

		const newState = this.plugin.reduce(this.state, action, playerId);
		if (!newState) {
			return { success: false, error: "Invalid action" };
		}

		this.state = newState;
		roomManager.setGameState(this.roomCode, this.state);

		this.broadcastState();

		if (this.plugin.isGameOver(this.state)) {
			this.finish();
			return { success: true };
		}

		this.processServerActions();
		this.syncTimer();
		return { success: true };
	}

	pause(disconnectedPlayerId: string): void {
		if (!this.state) {
			return;
		}

		// Ask plugin if we should pause
		const shouldPause = this.plugin.shouldPauseOnDisconnect
			? this.plugin.shouldPauseOnDisconnect(this.state, disconnectedPlayerId)
			: true;

		if (!shouldPause) {
			return;
		}

		// Save remaining timer duration
		if (this.timerHandle) {
			const timerConfig = this.plugin.getTimerConfig?.(this.state);
			if (timerConfig) {
				this.savedTimerRemaining = Math.max(0, timerConfig.durationMs);
				// For word-guess, timerEndsAt is in state — compute remaining from that
				const stateAny = this.state as Record<string, unknown>;
				if (typeof stateAny.timerEndsAt === "number") {
					this.savedTimerRemaining = Math.max(0, stateAny.timerEndsAt - Date.now());
				}
			}
			this.clearTimer();
		}

		const player = playerManager.get(disconnectedPlayerId);
		const now = Date.now();

		if (this.paused) {
			this.pauseInfo = {
				disconnectedPlayerId,
				disconnectedPlayerName: player?.name ?? "Игрок",
				pausedAt: now,
				timeoutAt: now + PAUSE_TIMEOUT_MS,
			};

			updatePersistedPauseInfo(this.roomCode, {
				...this.pauseInfo,
				savedTimerRemaining: this.savedTimerRemaining,
			});

			if (this.pauseTimerHandle) {
				clearTimeout(this.pauseTimerHandle);
			}
			this.pauseTimerHandle = setTimeout(() => {
				this.handlePauseTimeout();
			}, PAUSE_TIMEOUT_MS);

			this.broadcastPause();
			return;
		}

		this.paused = true;
		this.pauseInfo = {
			disconnectedPlayerId,
			disconnectedPlayerName: player?.name ?? "Игрок",
			pausedAt: now,
			timeoutAt: now + PAUSE_TIMEOUT_MS,
		};

		updatePersistedPauseInfo(this.roomCode, {
			...this.pauseInfo,
			savedTimerRemaining: this.savedTimerRemaining,
		});

		// Start pause timeout
		this.pauseTimerHandle = setTimeout(() => {
			this.handlePauseTimeout();
		}, PAUSE_TIMEOUT_MS);

		// Notify all connected players
		this.broadcastPause();

		console.log(
			`[game] paused in room ${this.roomCode} — waiting for ${this.pauseInfo.disconnectedPlayerName}`,
		);
	}

	resume(reconnectedPlayerId: string): void {
		if (!this.paused || !this.pauseInfo || !this.state) {
			return;
		}

		// Check if ALL players in the room are now connected
		const room = roomManager.get(this.roomCode);
		if (!room) {
			return;
		}
		const allConnected = room.playerIds.every((id) => {
			const p = playerManager.get(id);
			return p?.isConnected;
		});
		if (!allConnected) {
			return;
		}

		// Clear pause timeout
		if (this.pauseTimerHandle) {
			clearTimeout(this.pauseTimerHandle);
			this.pauseTimerHandle = null;
		}

		// Restore timer
		if (this.savedTimerRemaining !== null && this.savedTimerRemaining > 0) {
			// Update timerEndsAt in state if it exists
			const stateAny = this.state as Record<string, unknown>;
			if (typeof stateAny.timerEndsAt === "number") {
				stateAny.timerEndsAt = Date.now() + this.savedTimerRemaining;
				roomManager.setGameState(this.roomCode, this.state);
			}
		}

		this.paused = false;
		this.pauseInfo = null;
		this.savedTimerRemaining = null;

		updatePersistedPauseInfo(this.roomCode, null);

		// Restore game timer
		this.syncTimer();

		// Notify all connected players
		this.broadcastResume();
		this.broadcastState();

		console.log(`[game] resumed in room ${this.roomCode} — ${reconnectedPlayerId} reconnected`);
	}

	private handlePauseTimeout(): void {
		if (!this.paused || !this.state) {
			return;
		}

		console.log(`[game] pause timeout in room ${this.roomCode} — ending game`);

		this.paused = false;
		this.pauseInfo = null;
		this.pauseTimerHandle = null;
		this.savedTimerRemaining = null;

		updatePersistedPauseInfo(this.roomCode, null);

		this.finish();
	}

	private broadcastPause(): void {
		if (!this.pauseInfo) {
			return;
		}
		const room = roomManager.get(this.roomCode);
		if (!room) {
			return;
		}

		const msg = JSON.stringify({
			type: "gamePaused",
			pauseInfo: this.pauseInfo,
		});

		for (const playerId of room.playerIds) {
			const player = playerManager.get(playerId);
			if (!player?.ws || !player.isConnected) {
				continue;
			}
			player.ws.send(msg);
		}
	}

	private broadcastResume(): void {
		const room = roomManager.get(this.roomCode);
		if (!room) {
			return;
		}

		const msg = JSON.stringify({ type: "gameResumed" });

		for (const playerId of room.playerIds) {
			const player = playerManager.get(playerId);
			if (!player?.ws || !player.isConnected) {
				continue;
			}
			player.ws.send(msg);
		}
	}

	isPaused(): boolean {
		return this.paused;
	}

	getPauseInfo(): PauseInfo | null {
		return this.pauseInfo;
	}

	private broadcastState(): void {
		const room = roomManager.get(this.roomCode);
		if (!room) {
			return;
		}

		for (const playerId of room.playerIds) {
			const player = playerManager.get(playerId);
			if (!player?.ws || !player.isConnected) {
				continue;
			}

			const view = player.isSpectator
				? this.plugin.getSpectatorView(this.state)
				: this.plugin.getPlayerView(this.state, playerId);

			const msg = JSON.stringify({ type: "gameState", gameState: view });
			player.ws.send(msg);
		}
	}

	private processServerActions(): void {
		if (!this.state) {
			return;
		}

		const actions = this.plugin.getServerActions(this.state);
		for (const action of actions) {
			const newState = this.plugin.reduce(this.state, action, "__server__");
			if (newState) {
				this.state = newState;
				roomManager.setGameState(this.roomCode, this.state);
			}
		}

		if (actions.length > 0) {
			this.broadcastState();
		}
	}

	private finish(): void {
		this.clearTimer();
		if (this.pauseTimerHandle) {
			clearTimeout(this.pauseTimerHandle);
			this.pauseTimerHandle = null;
		}
		roomManager.setStatus(this.roomCode, "finished");

		const room = roomManager.get(this.roomCode);
		if (!room) {
			return;
		}

		for (const playerId of room.playerIds) {
			const player = playerManager.get(playerId);
			if (!player?.ws || !player.isConnected) {
				continue;
			}

			const view = this.plugin.getSpectatorView(this.state);
			const msg = JSON.stringify({ type: "gameOver", finalState: view });
			player.ws.send(msg);
		}
	}

	setTimer(durationMs: number, action: unknown): void {
		this.clearTimer();
		this.timerHandle = setTimeout(() => {
			this.handleAction("__server__", action);
		}, durationMs);
	}

	clearTimer(): void {
		if (this.timerHandle) {
			clearTimeout(this.timerHandle);
			this.timerHandle = null;
		}
		this.lastTimerKey = null;
	}

	private syncTimer(): void {
		if (!this.state || !this.plugin.getTimerConfig || this.paused) {
			return;
		}

		const config = this.plugin.getTimerConfig(this.state);

		if (!config) {
			this.clearTimer();
			return;
		}

		if (config.key === this.lastTimerKey) {
			return;
		}

		this.clearTimer();
		this.lastTimerKey = config.key;
		this.setTimer(config.durationMs, config.action);
	}

	restoreState(
		gameState: unknown,
		pauseInfo: (PauseInfo & { savedTimerRemaining?: number | null }) | null,
	): void {
		this.state = gameState;

		if (pauseInfo) {
			// Restore pause state
			this.paused = true;
			this.pauseInfo = {
				disconnectedPlayerId: pauseInfo.disconnectedPlayerId,
				disconnectedPlayerName: pauseInfo.disconnectedPlayerName,
				pausedAt: pauseInfo.pausedAt,
				timeoutAt: pauseInfo.timeoutAt,
			};
			this.savedTimerRemaining = pauseInfo.savedTimerRemaining ?? null;

			// Restart pause timeout with remaining time
			const pauseRemaining = Math.max(0, pauseInfo.timeoutAt - Date.now());
			if (pauseRemaining > 0) {
				this.pauseTimerHandle = setTimeout(() => {
					this.handlePauseTimeout();
				}, pauseRemaining);
			} else {
				// Pause already expired — end game
				this.handlePauseTimeout();
			}
		} else {
			// Not paused — but all players are disconnected after restart,
			// so put into pause state immediately
			// This will be handled by index.ts after restore
		}
	}

	getState(): unknown {
		return this.state;
	}

	getPlugin(): GamePlugin {
		return this.plugin;
	}

	destroy(): void {
		this.clearTimer();
		if (this.pauseTimerHandle) {
			clearTimeout(this.pauseTimerHandle);
			this.pauseTimerHandle = null;
		}
		this.state = null;
	}
}

// Active game engines per room
const engines = new Map<string, GameEngine>();

export function startGame(
	roomCode: string,
	gameId: string,
	players: PlayerInfo[],
	config: unknown,
): { engine?: GameEngine; error?: string } {
	const plugin = getPlugin(gameId);
	if (!plugin) {
		return { error: `Game "${gameId}" not found` };
	}

	if (players.length < plugin.minPlayers) {
		return { error: `Need at least ${plugin.minPlayers} players` };
	}
	if (players.length > plugin.maxPlayers) {
		return { error: `Max ${plugin.maxPlayers} players` };
	}

	// Clean up existing engine
	const existing = engines.get(roomCode);
	if (existing) {
		existing.destroy();
	}

	const engine = new GameEngine(plugin, roomCode);
	engines.set(roomCode, engine);
	engine.start(players, config);

	return { engine };
}

export function restoreGame(
	roomCode: string,
	gameId: string,
	gameState: unknown,
	pauseInfo: (PauseInfo & { savedTimerRemaining?: number | null }) | null,
): { engine?: GameEngine; error?: string } {
	const plugin = getPlugin(gameId);
	if (!plugin) {
		return { error: `Game "${gameId}" not found` };
	}

	const existing = engines.get(roomCode);
	if (existing) {
		existing.destroy();
	}

	const engine = new GameEngine(plugin, roomCode);
	engine.restoreState(gameState, pauseInfo);
	engines.set(roomCode, engine);

	return { engine };
}

export function getEngine(roomCode: string): GameEngine | null {
	return engines.get(roomCode) ?? null;
}

export function destroyEngine(roomCode: string): void {
	const engine = engines.get(roomCode);
	if (engine) {
		engine.destroy();
		engines.delete(roomCode);
	}
}
