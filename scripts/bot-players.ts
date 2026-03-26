/**
 * Bot players script — joins N bot players into an existing room with chaos mode.
 *
 * Usage:
 *   bun scripts/bot-players.ts <ROOM_CODE> [count=5] [host=localhost:3000]
 *
 * Example:
 *   1. Open browser, create a room — you'll see a room code like "AB12"
 *   2. Run: bun scripts/bot-players.ts AB12 10
 *   3. 10 bot players will join your room
 *
 * Chaos behaviors (random intervals per bot):
 *   - Go offline and reconnect after a few seconds
 *   - Send chat messages
 *   - Join/leave voice chat
 *   - Mute/unmute microphone
 *
 * Press Ctrl+C to disconnect all.
 */

const BOT_NAMES = [
	"Alice",
	"Bob",
	"Charlie",
	"Diana",
	"Eve",
	"Frank",
	"Grace",
	"Hank",
	"Ivy",
	"Jack",
	"Karen",
	"Leo",
	"Mia",
	"Nick",
	"Olivia",
	"Pete",
	"Quinn",
	"Rose",
	"Sam",
	"Tina",
];

const CHAT_MESSAGES = [
	"привет всем!",
	"ну что, начинаем?",
	"😂😂😂",
	"ого",
	"не понял",
	"давайте ещё раз",
	"кто это?",
	"я готов",
	"ахаха",
	"норм",
	"🔥🔥🔥",
	"ладно",
	"окей",
	"го",
	"gg",
	"ваще не понимаю",
	"а что происходит?",
	"круто!",
	"хм...",
	"👍",
	"не, ну это жесть",
	"сложна",
	"изи",
	"красава",
	"лол",
];

const roomCode = process.argv[2];
const count = Number(process.argv[3]) || 5;
const host = process.argv[4] || "localhost:3000";

if (!roomCode) {
	console.log("Usage: bun scripts/bot-players.ts <ROOM_CODE> [count=5] [host=localhost:3000]");
	process.exit(1);
}

console.log(`Joining ${count} bots into room ${roomCode} on ${host}...`);

interface Bot {
	name: string;
	index: number;
	ws: WebSocket | null;
	heartbeat: ReturnType<typeof setInterval> | null;
	chaosTimers: ReturnType<typeof setTimeout>[];
	inVoice: boolean;
	muted: boolean;
	offline: boolean;
}

const bots: Bot[] = [];
let shuttingDown = false;

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function send(bot: Bot, msg: Record<string, unknown>) {
	if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
		bot.ws.send(JSON.stringify(msg));
	}
}

// --- Chaos actions ---

function chaosChat(bot: Bot) {
	if (bot.offline || shuttingDown) return;
	send(bot, { type: "chatMessage", text: pick(CHAT_MESSAGES) });
	console.log(`  💬 ${bot.name} sent a chat message`);
	scheduleChaos(bot, chaosChat, rand(8_000, 30_000));
}

function chaosVoiceToggle(bot: Bot) {
	if (bot.offline || shuttingDown) return;
	if (bot.inVoice) {
		send(bot, { type: "voiceLeave" });
		bot.inVoice = false;
		bot.muted = false;
		console.log(`  🎙️ ${bot.name} left voice`);
	} else {
		send(bot, { type: "voiceJoin" });
		bot.inVoice = true;
		console.log(`  🎙️ ${bot.name} joined voice`);
	}
	scheduleChaos(bot, chaosVoiceToggle, rand(15_000, 60_000));
}

function chaosMuteToggle(bot: Bot) {
	if (bot.offline || shuttingDown || !bot.inVoice) return;
	bot.muted = !bot.muted;
	send(bot, { type: "voiceMute", muted: bot.muted });
	console.log(`  🔇 ${bot.name} ${bot.muted ? "muted" : "unmuted"}`);
	scheduleChaos(bot, chaosMuteToggle, rand(10_000, 40_000));
}

function chaosOffline(bot: Bot) {
	if (shuttingDown) return;
	// Go offline
	bot.offline = true;
	if (bot.heartbeat) {
		clearInterval(bot.heartbeat);
		bot.heartbeat = null;
	}
	if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
		bot.ws.close();
	}
	bot.ws = null;
	bot.inVoice = false;
	bot.muted = false;
	console.log(`  📴 ${bot.name} went offline`);

	// Come back after a delay
	const comeBackDelay = rand(5_000, 20_000);
	const timer = setTimeout(() => {
		if (shuttingDown) return;
		reconnectBot(bot);
	}, comeBackDelay);
	bot.chaosTimers.push(timer);
}

function reconnectBot(bot: Bot) {
	if (shuttingDown) return;
	console.log(`  📶 ${bot.name} reconnecting...`);

	const ws = new WebSocket(`ws://${host}/ws`);
	bot.ws = ws;

	ws.addEventListener("open", () => {
		send(bot, {
			type: "connect",
			playerName: bot.name,
			avatarSeed: Math.floor(Math.random() * 1000),
		});
	});

	ws.addEventListener("message", (event) => {
		const msg = JSON.parse(String(event.data));

		if (msg.type === "connected") {
			send(bot, { type: "joinRoom", roomCode });
		}

		if (msg.type === "roomJoined") {
			bot.offline = false;
			console.log(`  ✓ ${bot.name} reconnected`);
			// Restart heartbeat
			bot.heartbeat = setInterval(() => {
				send(bot, { type: "heartbeat" });
			}, 5000);
			// Schedule next offline event
			scheduleChaos(bot, chaosOffline, rand(30_000, 90_000));
		}

		if (msg.type === "error") {
			console.error(`  ✗ ${bot.name} reconnect failed: ${msg.message}`);
			ws.close();
		}
	});

	ws.addEventListener("error", () => {
		console.error(`  ✗ ${bot.name}: reconnect error`);
	});

	ws.addEventListener("close", () => {
		if (bot.heartbeat) {
			clearInterval(bot.heartbeat);
			bot.heartbeat = null;
		}
	});
}

function scheduleChaos(bot: Bot, fn: (bot: Bot) => void, delay: number) {
	const timer = setTimeout(() => fn(bot), delay);
	bot.chaosTimers.push(timer);
}

// --- Bot creation ---

function createBot(index: number): Promise<Bot> {
	const name = BOT_NAMES[index % BOT_NAMES.length] + (index >= BOT_NAMES.length ? `${Math.floor(index / BOT_NAMES.length) + 1}` : "");

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://${host}/ws`);
		const bot: Bot = {
			name,
			index,
			ws,
			heartbeat: null,
			chaosTimers: [],
			inVoice: false,
			muted: false,
			offline: false,
		};

		ws.addEventListener("open", () => {
			ws.send(JSON.stringify({
				type: "connect",
				playerName: name,
				avatarSeed: Math.floor(Math.random() * 1000),
			}));
		});

		ws.addEventListener("message", (event) => {
			const msg = JSON.parse(String(event.data));

			if (msg.type === "connected") {
				ws.send(JSON.stringify({
					type: "joinRoom",
					roomCode: roomCode,
				}));
			}

			if (msg.type === "roomJoined") {
				console.log(`  ✓ ${name} joined`);
				// Start heartbeat
				bot.heartbeat = setInterval(() => {
					send(bot, { type: "heartbeat" });
				}, 5000);

				// Start chaos with staggered delays per bot
				scheduleChaos(bot, chaosChat, rand(3_000, 15_000));
				scheduleChaos(bot, chaosVoiceToggle, rand(5_000, 25_000));
				scheduleChaos(bot, chaosMuteToggle, rand(10_000, 30_000));
				scheduleChaos(bot, chaosOffline, rand(30_000, 90_000));

				resolve(bot);
			}

			if (msg.type === "error") {
				console.error(`  ✗ ${name}: ${msg.message}`);
				ws.close();
				reject(new Error(msg.message));
			}
		});

		ws.addEventListener("error", (err) => {
			console.error(`  ✗ ${name}: connection error`);
			reject(err);
		});

		ws.addEventListener("close", () => {
			if (bot.heartbeat) {
				clearInterval(bot.heartbeat);
				bot.heartbeat = null;
			}
		});
	});
}

// Join bots sequentially (to avoid rate limiting)
for (let i = 0; i < count; i++) {
	try {
		const bot = await createBot(i);
		bots.push(bot);
	} catch {
		// Continue with remaining bots
	}
}

console.log(`\n${bots.length}/${count} bots connected with chaos mode. Press Ctrl+C to disconnect all.`);

// Graceful shutdown
process.on("SIGINT", () => {
	shuttingDown = true;
	console.log("\nDisconnecting bots...");
	for (const bot of bots) {
		// Clear all chaos timers
		for (const timer of bot.chaosTimers) clearTimeout(timer);
		if (bot.heartbeat) clearInterval(bot.heartbeat);
		if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
			if (bot.inVoice) {
				bot.ws.send(JSON.stringify({ type: "voiceLeave" }));
			}
			bot.ws.send(JSON.stringify({ type: "leaveRoom" }));
			bot.ws.close();
		}
	}
	process.exit(0);
});
