import { useCallback, useState } from "react";
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
import { PlayerRoster } from "../components/PlayerRoster";
import { useConnection } from "../contexts/ConnectionContext";
import "./LobbyScreen.css";

export function LobbyScreen() {
	const { room, playerId, send } = useConnection();
	const [codeCopied, setCodeCopied] = useState(false);

	const copyFromCode = useCallback(async () => {
		if (!room) {
			return;
		}
		const url = `${location.origin}/room/${room.code}`;
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// Fallback for non-secure contexts (http://, WebView, etc.)
			const ta = document.createElement("textarea");
			ta.value = url;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
		}
		setCodeCopied(true);
		setTimeout(() => setCodeCopied(false), 2000);
	}, [room]);

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
	const teamsValid = !isTeamsMode || Object.values(teams).every((members) => members.length >= 2);
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

	const gameMeta = GAME_META[room.settings.gameId];

	return (
		<div className="screen">
			<div className="lobby-header">
				<button type="button" className="lobby-back" onClick={handleLeave} title="Выйти">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Выйти</title>
						<path d="M19 12H5" />
						<path d="M12 19l-7-7 7-7" />
					</svg>
				</button>
				<div className="lobby-game-logo">
					<span className="game-logo game-logo--selected">
						<span className="game-logo-emoji">{gameMeta?.emoji}</span>
						<span className="game-logo-label">{gameMeta?.name}</span>
					</span>
				</div>
				<div
					className={`room-code${codeCopied ? " copied" : ""}`}
					onClick={copyFromCode}
					title="Нажмите, чтобы скопировать ссылку"
				>
					<span className="room-code-label">{codeCopied ? "Ссылка скопирована!" : "Комната"}</span>
					<span className="room-code-value">{room.code}</span>
				</div>
			</div>

			<PlayerRoster
				players={room.players}
				currentPlayerId={playerId}
				mode={rosterMode}
				teams={teams}
				isHost={isHost}
				onUpdateTeams={handleUpdateTeams}
				onSwitchTeam={(teamId) => send({ type: "switchTeam", teamId })}
				onKick={
					isHost ? (targetPlayerId) => send({ type: "kickPlayer", targetPlayerId }) : undefined
				}
			/>

			<GameSettings
				settings={room.settings}
				isHost={isHost}
				playerCount={room.players.length}
				onUpdate={handleSettingsChange}
			>
				{isHost ? (
					<button className="btn btn-primary" disabled={!canStartFinal} onClick={handleStart}>
						{room.players.length < 2
							? 2 - room.players.length === 1
								? "Нужен ещё 1 игрок"
								: "Нужно ещё 2 игрока"
							: !allConnected
								? "Не все игроки онлайн"
								: isTeamsMode && !teamsValid
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
			</GameSettings>
		</div>
	);
}
