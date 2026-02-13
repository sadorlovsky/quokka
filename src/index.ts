import index from "./index.html";
import { crocodilePlugin } from "./server/games/plugins/crocodile/plugin";
import { hangmanPlugin } from "./server/games/plugins/hangman/plugin";
import { tapewormPlugin } from "./server/games/plugins/tapeworm/plugin";
import { wordGuessPlugin } from "./server/games/plugins/word-guess/plugin";
import { seedWords } from "./server/games/plugins/word-guess/words";
import { registerPlugin } from "./server/games/registry";
import { initDatabase } from "./server/storage/sqlite";
import type { WSData } from "./server/ws/connection";
import { handleClose, handleMessage, handleOpen } from "./server/ws/handler";

// Initialize storage
initDatabase();
seedWords();

// Register game plugins
registerPlugin(wordGuessPlugin);
registerPlugin(tapewormPlugin);
registerPlugin(crocodilePlugin);
registerPlugin(hangmanPlugin);

// Restore persisted state
import { restoreGame } from "./server/games/engine";
import { playerManager } from "./server/rooms/player-manager";
import { roomManager } from "./server/rooms/room-manager";
import { loadAllRooms } from "./server/storage/sqlite";

const restoredPlayers = playerManager.restore();
const restoredRooms = roomManager.restore();

if (restoredPlayers > 0 || restoredRooms > 0) {
	console.log(`[restore] ${restoredPlayers} players, ${restoredRooms} rooms`);

	// Restore game engines for playing rooms and pause them
	const roomRows = loadAllRooms();
	for (const row of roomRows) {
		if (row.status !== "playing" || !row.game_state_json) {
			continue;
		}

		const room = roomManager.get(row.code);
		if (!room) {
			continue;
		}

		const gameState = JSON.parse(row.game_state_json);
		const pauseInfo = row.pause_info_json ? JSON.parse(row.pause_info_json) : null;

		const result = restoreGame(row.code, room.settings.gameId, gameState, pauseInfo);

		if (result.error) {
			console.warn(`[restore] failed to restore game in room ${row.code}: ${result.error}`);
			continue;
		}

		// If game wasn't already paused, pause it now (all players are disconnected)
		if (!pauseInfo && result.engine) {
			// Use persisted_at (last save time) to calculate remaining timer accurately
			// This avoids counting server downtime against the game timer
			const lastSaveTime = row.persisted_at || Date.now();
			const stateAny = gameState as Record<string, unknown>;
			const savedRemaining =
				typeof stateAny.timerEndsAt === "number"
					? Math.max(0, stateAny.timerEndsAt - lastSaveTime)
					: null;

			// Find any player to attribute the pause to (they're all disconnected)
			const pausePlayerId = room.playerIds[0];
			if (pausePlayerId) {
				result.engine.pause(pausePlayerId);
				// Override savedTimerRemaining if we computed it from state
				if (savedRemaining !== null) {
					(result.engine as unknown as { savedTimerRemaining: number | null }).savedTimerRemaining =
						savedRemaining;
				}
			}
		}

		console.log(`[restore] game restored in room ${row.code} (${room.settings.gameId})`);
	}
}

// Start room cleanup, player sweep, and rate limit cleanup
import { connectRateLimiter, gameActionRateLimiter, joinRateLimiter } from "./server/ws/rate-limit";

roomManager.startCleanup();
playerManager.startSweep();
connectRateLimiter.startSweep();
joinRateLimiter.startSweep();
gameActionRateLimiter.startSweep();

const server = Bun.serve({
	port: Number(process.env.PORT) || 3000,
	hostname: "0.0.0.0",
	routes: {
		"/sw.js": new Response(await Bun.file("public/sw.js").bytes(), {
			headers: {
				"Content-Type": "application/javascript",
				"Cache-Control": "no-cache",
			},
		}),
		"/*": index,
	},

	fetch(req, server) {
		const url = new URL(req.url);

		if (url.pathname === "/ws") {
			// Reject cross-origin WebSocket connections
			const origin = req.headers.get("origin");
			if (origin) {
				const host = req.headers.get("host");
				try {
					const originHost = new URL(origin).host;
					if (host && originHost !== host) {
						console.warn(`[security] origin rejected: origin=${origin} host=${host}`);
						return new Response("Forbidden", { status: 403 });
					}
				} catch {
					console.warn(`[security] malformed origin: origin=${origin}`);
					return new Response("Forbidden", { status: 403 });
				}
			}

			const success = server.upgrade(req, {
				data: {
					playerId: null,
					sessionToken: null,
				} satisfies WSData,
			});
			if (success) {
				return undefined;
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		return new Response("Not found", { status: 404 });
	},

	websocket: {
		open: handleOpen,
		message: handleMessage,
		close: handleClose,
		idleTimeout: 120,
		maxPayloadLength: 64 * 1024,
	},

	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},
});

import { networkInterfaces } from "node:os";

const port = server.port;
const addresses: string[] = [`  http://localhost:${port}`];

for (const [name, nets] of Object.entries(networkInterfaces())) {
	if (!nets) {
		continue;
	}
	for (const net of nets) {
		if (net.family !== "IPv4" || net.internal) {
			continue;
		}
		const label =
			name.startsWith("utun") || net.address.startsWith("100.") ? "tailscale" : "local network";
		addresses.push(`  http://${net.address}:${port} (${label})`);
	}
}

console.log(`\nServer running on:\n${addresses.join("\n")}\n`);
