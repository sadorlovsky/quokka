import type { BaseGameAction } from "./game";

// --- Roles ---

export type MafiaRole = "civilian" | "mafia" | "don" | "sheriff" | "doctor";
export type MafiaTeam = "town" | "mafia";

export function getRoleTeam(role: MafiaRole): MafiaTeam {
	return role === "mafia" || role === "don" ? "mafia" : "town";
}

export function getRoleName(role: MafiaRole): string {
	switch (role) {
		case "civilian":
			return "Мирный житель";
		case "mafia":
			return "Мафия";
		case "don":
			return "Дон мафии";
		case "sheriff":
			return "Комиссар";
		case "doctor":
			return "Доктор";
	}
}

export function getTeamName(team: MafiaTeam): string {
	return team === "town" ? "Город" : "Мафия";
}

// --- Phases ---

export type MafiaPhase =
	| "roleReveal"
	| "nightMafiaVote"
	| "nightSheriffCheck"
	| "nightDoctorHeal"
	| "nightResult"
	| "dayDiscussion"
	| "dayVoting"
	| "dayVoteResult"
	| "gameOver";

// --- Timer durations ---

export const ROLE_REVEAL_MS = 5_000;
export const NIGHT_MAFIA_VOTE_MS = 30_000;
export const NIGHT_SHERIFF_MS = 15_000;
export const NIGHT_DOCTOR_MS = 15_000;
export const NIGHT_RESULT_MS = 5_000;
export const DAY_VOTING_MS = 30_000;
export const DAY_VOTE_RESULT_MS = 5_000;

// --- Config ---

export interface MafiaConfig {
	discussionTimeSeconds: number;
	revealRoleOnDeath: boolean;
	doctorSelfHeal: boolean;
	anonymousVoting: boolean;
}

export const DEFAULT_MAFIA_CONFIG: MafiaConfig = {
	discussionTimeSeconds: 90,
	revealRoleOnDeath: true,
	doctorSelfHeal: false,
	anonymousVoting: false,
};

// --- Player State (server-side, full info) ---

export interface MafiaPlayerState {
	id: string;
	name: string;
	avatarSeed: number;
	role: MafiaRole;
	team: MafiaTeam;
	isAlive: boolean;
	deathRound: number | null;
	deathCause: "killed" | "voted" | null;
}

// --- Night Actions ---

export interface NightActions {
	mafiaVotes: Record<string, string>;
	mafiaTarget: string | null;
	sheriffTarget: string | null;
	sheriffResult: boolean | null;
	doctorTarget: string | null;
	wasProtected: boolean;
}

export function emptyNightActions(): NightActions {
	return {
		mafiaVotes: {},
		mafiaTarget: null,
		sheriffTarget: null,
		sheriffResult: null,
		doctorTarget: null,
		wasProtected: false,
	};
}

// --- Server-side Full State ---

export interface MafiaState {
	phase: MafiaPhase;
	round: number;

	players: MafiaPlayerState[];

	// Night state
	nightActions: NightActions;
	lastDoctorTarget: string | null;

	// Day voting state
	dayVotes: Record<string, string | "abstain">;
	dayVoteTarget: string | null;
	dayVoteTied: boolean;

	// Death announcement
	lastKilled: { id: string; name: string; role: MafiaRole } | null;
	lastNightSaved: boolean;

	// Win condition
	winner: MafiaTeam | null;

	timerEndsAt: number;
	config: MafiaConfig;
}

// --- Player View (personalized, sent to client) ---

export interface MafiaPlayerViewPlayer {
	id: string;
	name: string;
	avatarSeed: number;
	isAlive: boolean;
	role: MafiaRole | null;
	team: MafiaTeam | null;
	deathCause: "killed" | "voted" | null;
}

export interface MafiaPlayerView {
	phase: MafiaPhase;
	round: number;

	players: MafiaPlayerViewPlayer[];

	myRole: MafiaRole;
	myTeam: MafiaTeam;
	isAlive: boolean;

	// Mafia-only: fellow mafia member ids (always visible to mafia)
	mafiaMembers: string[] | null;

	// Night - mafia vote (visible to mafia only)
	mafiaVotes: Record<string, string> | null;

	// Night - sheriff result (visible to sheriff only, after check)
	sheriffResult: { targetId: string; isMafia: boolean } | null;

	// Night result announcement
	lastKilled: { id: string; name: string; role: MafiaRole | null } | null;
	lastNightSaved: boolean;

	// Day voting
	dayVotes: Record<string, string | "abstain"> | null;
	dayVoteTarget: string | null;
	dayVoteTied: boolean;

	// Can I act this phase?
	canAct: boolean;

	winner: MafiaTeam | null;
	timerEndsAt: number;
}

// --- Actions ---

export interface MafiaNightVoteAction extends BaseGameAction {
	type: "nightVote";
	targetId: string;
}

export interface MafiaSheriffCheckAction extends BaseGameAction {
	type: "sheriffCheck";
	targetId: string;
}

export interface MafiaDoctorHealAction extends BaseGameAction {
	type: "doctorHeal";
	targetId: string;
}

export interface MafiaDayVoteAction extends BaseGameAction {
	type: "dayVote";
	targetId: string | "abstain";
}

export interface MafiaPhaseTimeoutAction extends BaseGameAction {
	type: "phaseTimeout";
}

export type MafiaAction =
	| MafiaNightVoteAction
	| MafiaSheriffCheckAction
	| MafiaDoctorHealAction
	| MafiaDayVoteAction
	| MafiaPhaseTimeoutAction;
