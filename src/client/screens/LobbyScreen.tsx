import { getRecommendedSettings } from "@/shared/game-settings";
import { GAME_META } from "@/shared/games";
import { DEFAULT_CROCODILE_CONFIG } from "@/shared/types/crocodile";
import { DEFAULT_HANGMAN_CONFIG } from "@/shared/types/hangman";
import { DEFAULT_PERUDO_CONFIG } from "@/shared/types/perudo";
import type { RoomSettings } from "@/shared/types/room";
import { DEFAULT_TAPEWORM_CONFIG } from "@/shared/types/tapeworm";
import type { WordGuessConfig } from "@/shared/types/word-guess";
import { DEFAULT_WORD_GUESS_CONFIG } from "@/shared/types/word-guess";
import { GameSettings } from "../components/GameSettings";
import { LobbyChat } from "../components/LobbyChat";
import { PlayerRoster } from "../components/PlayerRoster";
import { RoomCodeButton } from "../components/RoomCodeButton";
import { VoiceControls } from "../components/VoiceControls";
import { useConnection } from "../contexts/ConnectionContext";
import { useVoice, VoiceProvider } from "../contexts/VoiceContext";
import "./LobbyScreen.css";

export function LobbyScreen() {
	return (
		<VoiceProvider>
			<LobbyScreenInner />
		</VoiceProvider>
	);
}

function LobbyScreenInner() {
	const { room, playerId, send } = useConnection();
	const { speakingPeerIds, serverSpeakingPeerIds, muted, peers, joined } = useVoice();

	if (!room) {
		return null;
	}

	const isHost = room.hostId === playerId;
	const allConnected = room.players.every((p) => p.isConnected);
	const canStart = isHost && room.players.length >= 2 && allConnected;
	const { gameId } = room.settings;

	const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
		tapeworm: DEFAULT_TAPEWORM_CONFIG,
		crocodile: DEFAULT_CROCODILE_CONFIG,
		hangman: DEFAULT_HANGMAN_CONFIG,
		perudo: DEFAULT_PERUDO_CONFIG,
		"word-guess": DEFAULT_WORD_GUESS_CONFIG,
	};
	const config = {
		...(DEFAULT_CONFIGS[gameId] ?? DEFAULT_WORD_GUESS_CONFIG),
		...room.settings.gameConfig,
	};

	const isTeamsMode = gameId === "word-guess" && (config as WordGuessConfig).mode === "teams";

	// Check teams validity for start (word-guess only)
	const teams = (
		gameId !== "tapeworm"
			? ((config as WordGuessConfig).teams ?? { a: [], b: [] })
			: { a: [], b: [] }
	) as Record<string, string[]>;
	const roomPlayerIds = room.players.map((p) => p.id);
	const assignmentCount = new Map<string, number>();
	for (const members of Object.values(teams)) {
		for (const playerId of members) {
			assignmentCount.set(playerId, (assignmentCount.get(playerId) ?? 0) + 1);
		}
	}
	const teamsComplete = roomPlayerIds.every((playerId) => assignmentCount.get(playerId) === 1);
	const teamsLargeEnough = Object.values(teams).every((members) => members.length >= 2);
	const teamsValid = !isTeamsMode || (teamsComplete && teamsLargeEnough);
	const canStartFinal = canStart && (!isTeamsMode || teamsValid);

	const handleStart = () => {
		send({ type: "startGame" });
	};

	const handleLeave = () => {
		send({ type: "leaveRoom" });
	};

	const handleUpdateTeams = (updatedTeams: Record<string, string[]>) => {
		send({
			type: "updateSettings",
			settings: {
				gameConfig: { ...config, teams: updatedTeams },
			},
		});
	};

	const handleSettingsChange = (settings: Partial<RoomSettings>) => {
		if (gameId !== "word-guess") {
			send({ type: "updateSettings", settings });
			return;
		}

		const wgConfig = config as WordGuessConfig;
		const newConfig = {
			...wgConfig,
			...(settings.gameConfig as Partial<WordGuessConfig>),
		};
		// When switching to teams mode, initialize default teams
		if (newConfig.mode === "teams" && !wgConfig.teams) {
			const playerIds = room.players.map((p) => p.id);
			const teamA = playerIds.filter((_, i) => i % 2 === 0);
			const teamB = playerIds.filter((_, i) => i % 2 !== 0);
			newConfig.teams = { a: teamA, b: teamB };
		}
		// Auto-apply recommended time/cycles
		const recommended = getRecommendedSettings(room.players.length, newConfig.difficulty);
		newConfig.roundTimeSeconds = recommended.roundTimeSeconds;
		newConfig.cycles = recommended.cycles;

		send({
			type: "updateSettings",
			settings: { gameConfig: newConfig },
		});
	};

	const rosterMode = gameId === "word-guess" ? (config as WordGuessConfig).mode : "ffa";

	const mutedPeerIds = new Set<string>();
	for (const peer of peers) {
		if (peer.muted) {
			mutedPeerIds.add(peer.playerId);
		}
	}
	if (joined && muted && playerId) {
		mutedPeerIds.add(playerId);
	}

	// Voice participants use local VAD; non-voice observers use server-broadcast speaking state
	const effectiveSpeakingPeerIds = joined ? speakingPeerIds : serverSpeakingPeerIds;

	// Set of player IDs currently in voice chat (for showing "in voice" indicator)
	const voicePeerIds = new Set(peers.map((p) => p.playerId));
	if (joined && playerId) {
		voicePeerIds.add(playerId);
	}

	const gameMeta = GAME_META[room.settings.gameId];

	return (
		<div className="screen lobby-screen">
			{/* Top bar: back button + hero + room code */}
			<div className="lobby-topbar">
				<button type="button" className="lobby-back" onClick={handleLeave}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Выйти</title>
						<path d="M19 12H5" />
						<path d="M12 19l-7-7 7-7" />
					</svg>
					<span>Выйти</span>
				</button>

				<div className="lobby-hero">
					<img src="/quokka.svg" alt="" className="lobby-hero-mascot" aria-hidden="true" />
					<span className="lobby-hero-title">Квокка</span>
					<span className="lobby-hero-separator">·</span>
					<span className="lobby-hero-emoji">{gameMeta?.emoji}</span>
					<span className="lobby-hero-name">{gameMeta?.name}</span>
				</div>

				<div className="lobby-topbar-right">
					<RoomCodeButton code={room.code} />
				</div>
			</div>

			{/* Content: players + settings */}
			<div className="lobby-columns">
				<section className="lobby-col-players" aria-label="Игроки">
					<h3 className="settings-title">Игроки</h3>
					<PlayerRoster
						players={room.players}
						currentPlayerId={playerId}
						mode={rosterMode}
						teams={teams}
						isHost={isHost}
						speakingPeerIds={effectiveSpeakingPeerIds}
						mutedPeerIds={mutedPeerIds}
						voicePeerIds={voicePeerIds}
						onUpdateTeams={handleUpdateTeams}
						onSwitchTeam={(teamId) => send({ type: "switchTeam", teamId })}
						onKick={
							isHost ? (targetPlayerId) => send({ type: "kickPlayer", targetPlayerId }) : undefined
						}
					/>
				</section>

				<section className="lobby-col-settings" aria-label="Настройки">
					<GameSettings
						settings={room.settings}
						isHost={isHost}
						playerCount={room.players.length}
						onUpdate={handleSettingsChange}
					/>
				</section>
			</div>

			{/* Chat + start button pinned to bottom */}
			<div className="lobby-actions">
				<LobbyChat voiceControls={<VoiceControls />} />
				{isHost ? (
					<button className="btn btn-primary" disabled={!canStartFinal} onClick={handleStart}>
						{room.players.length < 2
							? 2 - room.players.length === 1
								? "Нужен ещё 1 игрок"
								: "Нужно ещё 2 игрока"
							: !allConnected
								? "Не все игроки онлайн"
								: isTeamsMode && !teamsComplete
									? "Распределите всех игроков по одной команде"
									: isTeamsMode && !teamsLargeEnough
										? "В каждой команде нужно минимум 2 игрока"
										: "Начать игру"}
					</button>
				) : (
					<div className="waiting-host">
						<p className="waiting-host-text">
							<span className="waiting-dots">
								<span>.</span>
								<span>.</span>
								<span>.</span>
							</span>
							Ждём, когда{" "}
							<strong>{room.players.find((p) => p.id === room!.hostId)?.name ?? "хост"}</strong>{" "}
							начнёт игру
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
