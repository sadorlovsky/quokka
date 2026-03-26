interface RateLimitEntry {
	count: number;
	resetAt: number;
}

export class RateLimiter {
	private limits = new Map<string, RateLimitEntry>();
	private maxRequests: number;
	private windowMs: number;
	readonly name: string;

	constructor(maxRequests: number, windowMs: number, name = "unknown") {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
		this.name = name;
	}

	check(key: string): boolean {
		const now = Date.now();
		const entry = this.limits.get(key);

		if (!entry || now >= entry.resetAt) {
			this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
			return true;
		}

		if (entry.count >= this.maxRequests) {
			console.warn(`[security] rate-limit hit: ${this.name} key=${key}`);
			return false;
		}

		entry.count++;
		return true;
	}

	sweep(): number {
		const now = Date.now();
		let removed = 0;

		for (const [key, entry] of this.limits) {
			if (now >= entry.resetAt) {
				this.limits.delete(key);
				removed++;
			}
		}

		return removed;
	}

	startSweep(intervalMs = 60_000): void {
		setInterval(() => {
			this.sweep();
		}, intervalMs);
	}

	get size(): number {
		return this.limits.size;
	}
}

// 5 join attempts per minute per IP
export const joinRateLimiter = new RateLimiter(5, 60_000, "join");

// 10 connect attempts per minute per IP
export const connectRateLimiter = new RateLimiter(10, 60_000, "connect");

// 10 game actions per second per player (keyed by playerId)
export const gameActionRateLimiter = new RateLimiter(10, 1_000, "gameAction");

// 30 drawing strokes per second per player (keyed by playerId)
export const drawStrokeRateLimiter = new RateLimiter(30, 1_000, "drawStroke");

// 5 chat messages per 3 seconds per player (keyed by playerId)
export const chatRateLimiter = new RateLimiter(5, 3_000, "chat");

// 50 voice signaling messages per second per player (SDP + ICE candidates burst)
export const voiceSignalRateLimiter = new RateLimiter(50, 1_000, "voiceSignal");
