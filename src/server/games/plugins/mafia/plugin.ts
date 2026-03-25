import type { GamePlugin, TimerConfig } from "@/shared/types/game";
import type {
	MafiaAction,
	MafiaConfig,
	MafiaPhase,
	MafiaPlayerState,
	MafiaPlayerView,
	MafiaPlayerViewPlayer,
	MafiaRole,
	MafiaState,
	MafiaTeam,
} from "@/shared/types/mafia";
import {
	DAY_VOTE_RESULT_MS,
	DAY_VOTING_MS,
	DEFAULT_MAFIA_CONFIG,
	emptyNightActions,
	getRoleTeam,
	NIGHT_DOCTOR_MS,
	NIGHT_MAFIA_VOTE_MS,
	NIGHT_RESULT_MS,
	NIGHT_SHERIFF_MS,
	ROLE_REVEAL_MS,
} from "@/shared/types/mafia";
import type { PlayerInfo } from "@/shared/types/room";

// --- Helpers ---

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j]!, a[i]!];
	}
	return a;
}

function getMafiaCount(playerCount: number): number {
	// 6-7: 2 mafia, 8-10: 3 mafia, 11-13: 4 mafia, 14-16: 5 mafia
	if (playerCount <= 7) {
		return 2;
	}
	if (playerCount <= 10) {
		return 3;
	}
	if (playerCount <= 13) {
		return 4;
	}
	return 5;
}

function distributeRoles(playerCount: number): MafiaRole[] {
	const totalMafia = getMafiaCount(playerCount);
	const regularMafia = totalMafia - 1; // one is always the Don

	const roles: MafiaRole[] = [];
	roles.push("don");
	for (let i = 0; i < regularMafia; i++) {
		roles.push("mafia");
	}
	roles.push("sheriff");
	if (playerCount >= 7) {
		roles.push("doctor");
	}
	while (roles.length < playerCount) {
		roles.push("civilian");
	}

	return shuffle(roles);
}

function getAlivePlayers(state: MafiaState): MafiaPlayerState[] {
	return state.players.filter((p) => p.isAlive);
}

function getAliveByTeam(state: MafiaState, team: MafiaTeam): MafiaPlayerState[] {
	return state.players.filter((p) => p.isAlive && p.team === team);
}

function getAliveByRole(state: MafiaState, role: MafiaRole): MafiaPlayerState | undefined {
	return state.players.find((p) => p.isAlive && p.role === role);
}

function checkWinCondition(state: MafiaState): MafiaTeam | null {
	const aliveMafia = getAliveByTeam(state, "mafia").length;
	const aliveTown = getAliveByTeam(state, "town").length;

	if (aliveMafia === 0) {
		return "town";
	}
	if (aliveMafia >= aliveTown) {
		return "mafia";
	}
	return null;
}

function killPlayer(state: MafiaState, playerId: string, cause: "killed" | "voted"): MafiaState {
	return {
		...state,
		players: state.players.map((p) =>
			p.id === playerId ? { ...p, isAlive: false, deathRound: state.round, deathCause: cause } : p,
		),
	};
}

function resolveMafiaVote(state: MafiaState): string | null {
	const votes = state.nightActions.mafiaVotes;
	const aliveMafia = getAliveByTeam(state, "mafia");

	if (aliveMafia.length === 0) {
		return null;
	}

	// Count votes
	const counts: Record<string, number> = {};
	for (const targetId of Object.values(votes)) {
		counts[targetId] = (counts[targetId] || 0) + 1;
	}

	if (Object.keys(counts).length === 0) {
		// Nobody voted — pick random alive non-mafia
		const targets = state.players.filter((p) => p.isAlive && p.team !== "mafia");
		if (targets.length === 0) {
			return null;
		}
		return targets[Math.floor(Math.random() * targets.length)]!.id;
	}

	// Find max vote count
	const maxCount = Math.max(...Object.values(counts));
	const tied = Object.entries(counts)
		.filter(([, c]) => c === maxCount)
		.map(([id]) => id);

	if (tied.length === 1) {
		return tied[0]!;
	}

	// Tie-break: Don's vote wins
	const don = aliveMafia.find((p) => p.role === "don");
	if (don && votes[don.id] && tied.includes(votes[don.id]!)) {
		return votes[don.id]!;
	}

	// Random among tied
	return tied[Math.floor(Math.random() * tied.length)]!;
}

function resolveDayVote(state: MafiaState): { target: string | null; tied: boolean } {
	const alive = getAlivePlayers(state);
	const votes = state.dayVotes;

	// Count votes (excluding abstentions)
	const counts: Record<string, number> = {};
	let abstainCount = 0;

	for (const p of alive) {
		const vote = votes[p.id];
		if (!vote || vote === "abstain") {
			abstainCount++;
		} else {
			counts[vote] = (counts[vote] || 0) + 1;
		}
	}

	if (Object.keys(counts).length === 0) {
		return { target: null, tied: false };
	}

	const maxCount = Math.max(...Object.values(counts));

	// If abstain count is higher or equal, nobody eliminated
	if (abstainCount >= maxCount) {
		return { target: null, tied: true };
	}

	const tied = Object.entries(counts)
		.filter(([, c]) => c === maxCount)
		.map(([id]) => id);

	if (tied.length === 1) {
		return { target: tied[0]!, tied: false };
	}

	// Tie — nobody eliminated
	return { target: null, tied: true };
}

/** Determine the next night sub-phase, skipping dead roles */
function getNextNightPhase(state: MafiaState, current: MafiaPhase): MafiaPhase {
	if (current === "nightMafiaVote") {
		if (getAliveByRole(state, "sheriff")) {
			return "nightSheriffCheck";
		}
		if (getAliveByRole(state, "doctor")) {
			return "nightDoctorHeal";
		}
		return "nightResult";
	}
	if (current === "nightSheriffCheck") {
		if (getAliveByRole(state, "doctor")) {
			return "nightDoctorHeal";
		}
		return "nightResult";
	}
	return "nightResult";
}

function getDurationForPhase(phase: MafiaPhase, config: MafiaConfig): number {
	switch (phase) {
		case "roleReveal":
			return ROLE_REVEAL_MS;
		case "nightMafiaVote":
			return NIGHT_MAFIA_VOTE_MS;
		case "nightSheriffCheck":
			return NIGHT_SHERIFF_MS;
		case "nightDoctorHeal":
			return NIGHT_DOCTOR_MS;
		case "nightResult":
			return NIGHT_RESULT_MS;
		case "dayDiscussion":
			return config.discussionTimeSeconds * 1000;
		case "dayVoting":
			return DAY_VOTING_MS;
		case "dayVoteResult":
			return DAY_VOTE_RESULT_MS;
		default:
			return 0;
	}
}

function transitionTo(state: MafiaState, phase: MafiaPhase): MafiaState {
	return {
		...state,
		phase,
		timerEndsAt: Date.now() + getDurationForPhase(phase, state.config),
	};
}

function allMafiaVoted(state: MafiaState): boolean {
	const aliveMafia = getAliveByTeam(state, "mafia");
	return aliveMafia.every((p) => p.id in state.nightActions.mafiaVotes);
}

function allDayVoted(state: MafiaState): boolean {
	const alive = getAlivePlayers(state);
	return alive.every((p) => p.id in state.dayVotes);
}

// --- Player View ---

function buildPlayerView(state: MafiaState, playerId: string): MafiaPlayerView {
	const me = state.players.find((p) => p.id === playerId);
	if (!me) {
		// Spectator fallback
		return buildSpectatorAsPlayerView(state);
	}

	const isMafia = me.team === "mafia";
	const isSheriff = me.role === "sheriff";
	const isGameOver = state.phase === "gameOver";

	const players: MafiaPlayerViewPlayer[] = state.players.map((p) => {
		let role: MafiaRole | null = null;
		let team: MafiaTeam | null = null;

		if (p.id === playerId) {
			// Always see own role
			role = p.role;
			team = p.team;
		} else if (isGameOver) {
			// Game over: reveal all
			role = p.role;
			team = p.team;
		} else if (!p.isAlive && state.config.revealRoleOnDeath) {
			// Dead player with reveal config
			role = p.role;
			team = p.team;
		} else if (isMafia && (p.role === "mafia" || p.role === "don")) {
			// Mafia sees fellow mafia
			role = p.role;
			team = "mafia";
		}

		return {
			id: p.id,
			name: p.name,
			avatarSeed: p.avatarSeed,
			isAlive: p.isAlive,
			role,
			team,
			deathCause: p.deathCause,
		};
	});

	// Mafia members list (for mafia players only)
	const mafiaMembers = isMafia
		? state.players.filter((p) => p.team === "mafia").map((p) => p.id)
		: null;

	// Mafia votes (for mafia players only, during night vote)
	const mafiaVotes =
		isMafia && (state.phase === "nightMafiaVote" || state.phase === "nightResult")
			? state.nightActions.mafiaVotes
			: null;

	// Sheriff result (for sheriff only, after check)
	let sheriffResult: MafiaPlayerView["sheriffResult"] = null;
	if (isSheriff && state.nightActions.sheriffTarget && state.nightActions.sheriffResult !== null) {
		sheriffResult = {
			targetId: state.nightActions.sheriffTarget,
			isMafia: state.nightActions.sheriffResult,
		};
	}

	// Last killed — hide role if config says so
	let lastKilled: MafiaPlayerView["lastKilled"] = null;
	if (state.lastKilled) {
		lastKilled = {
			id: state.lastKilled.id,
			name: state.lastKilled.name,
			role: state.config.revealRoleOnDeath || isGameOver ? state.lastKilled.role : null,
		};
	}

	// Day votes — hide during voting if anonymous, show after
	let dayVotes: MafiaPlayerView["dayVotes"] = null;
	if (state.phase === "dayVoting") {
		dayVotes = state.config.anonymousVoting ? null : state.dayVotes;
	} else if (state.phase === "dayVoteResult" || isGameOver) {
		dayVotes = state.dayVotes;
	}

	// Can act?
	let canAct = false;
	if (me.isAlive) {
		if (state.phase === "nightMafiaVote" && isMafia) {
			canAct = !(me.id in state.nightActions.mafiaVotes);
		} else if (state.phase === "nightSheriffCheck" && isSheriff) {
			canAct = state.nightActions.sheriffTarget === null;
		} else if (state.phase === "nightDoctorHeal" && me.role === "doctor") {
			canAct = state.nightActions.doctorTarget === null;
		} else if (state.phase === "dayVoting") {
			canAct = !(me.id in state.dayVotes);
		}
	}

	return {
		phase: state.phase,
		round: state.round,
		players,
		myRole: me.role,
		myTeam: me.team,
		isAlive: me.isAlive,
		mafiaMembers,
		mafiaVotes,
		sheriffResult,
		lastKilled,
		lastNightSaved: state.lastNightSaved,
		dayVotes,
		dayVoteTarget: state.dayVoteTarget,
		dayVoteTied: state.dayVoteTied,
		canAct,
		winner: state.winner,
		timerEndsAt: state.timerEndsAt,
	};
}

function buildSpectatorAsPlayerView(state: MafiaState): MafiaPlayerView {
	const players: MafiaPlayerViewPlayer[] = state.players.map((p) => ({
		id: p.id,
		name: p.name,
		avatarSeed: p.avatarSeed,
		isAlive: p.isAlive,
		role: p.role,
		team: p.team,
		deathCause: p.deathCause,
	}));

	let lastKilled: MafiaPlayerView["lastKilled"] = null;
	if (state.lastKilled) {
		lastKilled = {
			id: state.lastKilled.id,
			name: state.lastKilled.name,
			role: state.lastKilled.role,
		};
	}

	return {
		phase: state.phase,
		round: state.round,
		players,
		myRole: "civilian",
		myTeam: "town",
		isAlive: false,
		mafiaMembers: state.players.filter((p) => p.team === "mafia").map((p) => p.id),
		mafiaVotes: state.nightActions.mafiaVotes,
		sheriffResult: null,
		lastKilled,
		lastNightSaved: state.lastNightSaved,
		dayVotes: state.dayVotes,
		dayVoteTarget: state.dayVoteTarget,
		dayVoteTied: state.dayVoteTied,
		canAct: false,
		winner: state.winner,
		timerEndsAt: state.timerEndsAt,
	};
}

// --- Plugin ---

export const mafiaPlugin: GamePlugin<MafiaState, MafiaAction, MafiaConfig> = {
	id: "mafia",
	name: "Мафия",
	minPlayers: 6,
	maxPlayers: 16,
	defaultConfig: DEFAULT_MAFIA_CONFIG,

	createInitialState(players: PlayerInfo[], config: MafiaConfig): MafiaState {
		const roles = distributeRoles(players.length);

		const mafiaPlayers: MafiaPlayerState[] = players.map((p, i) => ({
			id: p.id,
			name: p.name,
			avatarSeed: p.avatarSeed,
			role: roles[i]!,
			team: getRoleTeam(roles[i]!),
			isAlive: true,
			deathRound: null,
			deathCause: null,
		}));

		return {
			phase: "roleReveal",
			round: 1,
			players: mafiaPlayers,
			nightActions: emptyNightActions(),
			lastDoctorTarget: null,
			dayVotes: {},
			dayVoteTarget: null,
			dayVoteTied: false,
			lastKilled: null,
			lastNightSaved: false,
			winner: null,
			timerEndsAt: Date.now() + ROLE_REVEAL_MS,
			config,
		};
	},

	validateAction(state: MafiaState, action: MafiaAction, playerId: string): string | null {
		switch (action.type) {
			case "phaseTimeout": {
				if (playerId !== "__server__") {
					return "Only server can timeout";
				}
				if (state.phase === "gameOver") {
					return "Game is over";
				}
				return null;
			}

			case "nightVote": {
				if (state.phase !== "nightMafiaVote") {
					return "Not in mafia vote phase";
				}
				const player = state.players.find((p) => p.id === playerId);
				if (!player || !player.isAlive) {
					return "Player not alive";
				}
				if (player.team !== "mafia") {
					return "Only mafia can vote at night";
				}
				if (playerId in state.nightActions.mafiaVotes) {
					return "Already voted";
				}
				const target = state.players.find((p) => p.id === action.targetId);
				if (!target || !target.isAlive) {
					return "Invalid target";
				}
				if (target.team === "mafia") {
					return "Cannot target fellow mafia";
				}
				return null;
			}

			case "sheriffCheck": {
				if (state.phase !== "nightSheriffCheck") {
					return "Not in sheriff check phase";
				}
				const player = state.players.find((p) => p.id === playerId);
				if (!player || !player.isAlive) {
					return "Player not alive";
				}
				if (player.role !== "sheriff") {
					return "Only sheriff can check";
				}
				if (state.nightActions.sheriffTarget !== null) {
					return "Already checked";
				}
				const target = state.players.find((p) => p.id === action.targetId);
				if (!target || !target.isAlive) {
					return "Invalid target";
				}
				if (target.id === playerId) {
					return "Cannot check yourself";
				}
				return null;
			}

			case "doctorHeal": {
				if (state.phase !== "nightDoctorHeal") {
					return "Not in doctor heal phase";
				}
				const player = state.players.find((p) => p.id === playerId);
				if (!player || !player.isAlive) {
					return "Player not alive";
				}
				if (player.role !== "doctor") {
					return "Only doctor can heal";
				}
				if (state.nightActions.doctorTarget !== null) {
					return "Already healed";
				}
				const target = state.players.find((p) => p.id === action.targetId);
				if (!target || !target.isAlive) {
					return "Invalid target";
				}
				if (target.id === playerId && !state.config.doctorSelfHeal) {
					return "Doctor cannot heal self";
				}
				if (action.targetId === state.lastDoctorTarget) {
					return "Cannot heal same player two nights in a row";
				}
				return null;
			}

			case "dayVote": {
				if (state.phase !== "dayVoting") {
					return "Not in voting phase";
				}
				const player = state.players.find((p) => p.id === playerId);
				if (!player || !player.isAlive) {
					return "Player not alive";
				}
				if (playerId in state.dayVotes) {
					return "Already voted";
				}
				if (action.targetId !== "abstain") {
					const target = state.players.find((p) => p.id === action.targetId);
					if (!target || !target.isAlive) {
						return "Invalid target";
					}
					if (target.id === playerId) {
						return "Cannot vote for yourself";
					}
				}
				return null;
			}

			default:
				return "Unknown action";
		}
	},

	reduce(state: MafiaState, action: MafiaAction, _playerId: string): MafiaState | null {
		switch (action.type) {
			case "phaseTimeout": {
				return handlePhaseTimeout(state);
			}

			case "nightVote": {
				const newVotes = { ...state.nightActions.mafiaVotes, [_playerId]: action.targetId };
				const newState: MafiaState = {
					...state,
					nightActions: { ...state.nightActions, mafiaVotes: newVotes },
				};
				// If all mafia voted, auto-advance
				if (allMafiaVoted(newState)) {
					return advanceFromMafiaVote(newState);
				}
				return newState;
			}

			case "sheriffCheck": {
				const target = state.players.find((p) => p.id === action.targetId)!;
				const isMafia = target.team === "mafia";
				const newState: MafiaState = {
					...state,
					nightActions: {
						...state.nightActions,
						sheriffTarget: action.targetId,
						sheriffResult: isMafia,
					},
				};
				// Auto-advance to next phase
				const nextPhase = getNextNightPhase(newState, "nightSheriffCheck");
				return transitionTo(newState, nextPhase);
			}

			case "doctorHeal": {
				const newState: MafiaState = {
					...state,
					nightActions: {
						...state.nightActions,
						doctorTarget: action.targetId,
					},
				};
				// Auto-advance to nightResult
				return transitionTo(newState, "nightResult");
			}

			case "dayVote": {
				const newVotes = { ...state.dayVotes, [_playerId]: action.targetId };
				const newState: MafiaState = { ...state, dayVotes: newVotes };
				// If all alive voted, auto-advance
				if (allDayVoted(newState)) {
					return resolveDayAndTransition(newState);
				}
				return newState;
			}

			default:
				return null;
		}
	},

	getPlayerView(state: MafiaState, playerId: string): MafiaPlayerView {
		return buildPlayerView(state, playerId);
	},

	getSpectatorView(state: MafiaState): MafiaPlayerView {
		return buildSpectatorAsPlayerView(state);
	},

	getServerActions(): MafiaAction[] {
		return [];
	},

	isGameOver(state: MafiaState): boolean {
		return state.phase === "gameOver";
	},

	shouldPauseOnDisconnect(): boolean {
		return true;
	},

	getTimerConfig(state: MafiaState): TimerConfig | null {
		if (state.phase === "gameOver") {
			return null;
		}

		const delay = state.timerEndsAt - Date.now();
		if (delay <= 0) {
			return null;
		}

		return {
			key: `${state.phase}-${state.round}`,
			durationMs: delay,
			action: { type: "phaseTimeout" },
		};
	},
};

// --- Phase timeout handler ---

function handlePhaseTimeout(state: MafiaState): MafiaState {
	switch (state.phase) {
		case "roleReveal": {
			// Start first night
			return transitionTo(
				{ ...state, nightActions: emptyNightActions(), lastKilled: null, lastNightSaved: false },
				"nightMafiaVote",
			);
		}

		case "nightMafiaVote": {
			return advanceFromMafiaVote(state);
		}

		case "nightSheriffCheck": {
			// Sheriff didn't check — skip
			const nextPhase = getNextNightPhase(state, "nightSheriffCheck");
			return transitionTo(state, nextPhase);
		}

		case "nightDoctorHeal": {
			// Doctor didn't heal — skip
			return transitionTo(state, "nightResult");
		}

		case "nightResult": {
			return advanceFromNightResult(state);
		}

		case "dayDiscussion": {
			return transitionTo({ ...state, dayVotes: {} }, "dayVoting");
		}

		case "dayVoting": {
			return resolveDayAndTransition(state);
		}

		case "dayVoteResult": {
			return advanceFromDayVoteResult(state);
		}

		default:
			return state;
	}
}

function advanceFromMafiaVote(state: MafiaState): MafiaState {
	// Resolve mafia target
	const mafiaTarget = resolveMafiaVote(state);
	const newState: MafiaState = {
		...state,
		nightActions: { ...state.nightActions, mafiaTarget },
	};

	const nextPhase = getNextNightPhase(newState, "nightMafiaVote");
	return transitionTo(newState, nextPhase);
}

function advanceFromNightResult(state: MafiaState): MafiaState {
	// Resolve night: apply kill, check doctor save
	const mafiaTarget = state.nightActions.mafiaTarget;
	const doctorTarget = state.nightActions.doctorTarget;
	const wasProtected = mafiaTarget !== null && mafiaTarget === doctorTarget;

	let newState = { ...state, lastNightSaved: wasProtected };

	if (mafiaTarget && !wasProtected) {
		const killed = state.players.find((p) => p.id === mafiaTarget)!;
		newState = killPlayer(newState, mafiaTarget, "killed");
		newState.lastKilled = { id: killed.id, name: killed.name, role: killed.role };
	} else {
		newState.lastKilled = null;
	}

	// Save doctor target for next night restriction
	newState.lastDoctorTarget = doctorTarget;

	// Check win condition
	const winner = checkWinCondition(newState);
	if (winner) {
		return { ...newState, phase: "gameOver", winner };
	}

	return transitionTo(newState, "dayDiscussion");
}

function resolveDayAndTransition(state: MafiaState): MafiaState {
	const { target, tied } = resolveDayVote(state);

	let newState: MafiaState = {
		...state,
		dayVoteTarget: target,
		dayVoteTied: tied,
	};

	if (target) {
		const killed = state.players.find((p) => p.id === target)!;
		newState = killPlayer(newState, target, "voted");
		newState.lastKilled = { id: killed.id, name: killed.name, role: killed.role };
	} else {
		newState.lastKilled = null;
	}

	return transitionTo(newState, "dayVoteResult");
}

function advanceFromDayVoteResult(state: MafiaState): MafiaState {
	// Check win condition
	const winner = checkWinCondition(state);
	if (winner) {
		return { ...state, phase: "gameOver", winner };
	}

	// Start next night
	const newState: MafiaState = {
		...state,
		round: state.round + 1,
		nightActions: emptyNightActions(),
		dayVotes: {},
		dayVoteTarget: null,
		dayVoteTied: false,
		lastKilled: null,
		lastNightSaved: false,
	};

	return transitionTo(newState, "nightMafiaVote");
}
