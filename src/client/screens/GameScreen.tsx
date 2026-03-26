import { useEffect, useState } from "react";
import { GAME_META } from "@/shared/games";
import type { PlayerInfo } from "@/shared/types/room";
import { PlayerChip } from "../components/PlayerChip";
import { RoomCodeButton } from "../components/RoomCodeButton";
import { VoiceControls } from "../components/VoiceControls";
import { useConnection } from "../contexts/ConnectionContext";
import { CrocodileGame } from "../games/crocodile/CrocodileGame";
import { HangmanGame } from "../games/hangman/HangmanGame";
import { MafiaGame } from "../games/mafia/MafiaGame";
import { PerudoGame } from "../games/perudo/PerudoGame";
import { TapewormGame } from "../games/tapeworm/TapewormGame";
import { WordGuessGame } from "../games/word-guess/WordGuessGame";
import "./GameScreen.css";

function PauseOverlay({
	playerName,
	timeoutAt,
	players,
	currentPlayerId,
	isHost,
	onEndGame,
}: {
	playerName: string;
	timeoutAt: number;
	players: PlayerInfo[];
	currentPlayerId: string | null;
	isHost: boolean;
	onEndGame: () => void;
}) {
	const [secondsLeft, setSecondsLeft] = useState(() =>
		Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000)),
	);

	useEffect(() => {
		const interval = setInterval(() => {
			const left = Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000));
			setSecondsLeft(left);
			if (left <= 0) {
				clearInterval(interval);
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [timeoutAt]);

	return (
		<div className="pause-overlay">
			<p className="pause-overlay-title">Игра на паузе</p>
			<p className="pause-overlay-text">{playerName} отключился</p>
			<p className="pause-overlay-timer">{secondsLeft} сек</p>

			<div className="pause-overlay-body">
				<ul className="pause-overlay-players">
					{players.map((p) => (
						<li key={p.id}>
							<PlayerChip
								avatarSeed={p.avatarSeed}
								name={p.name}
								isMe={p.id === currentPlayerId}
								disconnected={!p.isConnected}
							>
								<span
									className={`pause-overlay-player-status ${p.isConnected ? "pause-overlay-player-status--online" : "pause-overlay-player-status--offline"}`}
								>
									{p.isConnected ? "в сети" : "не в сети"}
								</span>
							</PlayerChip>
						</li>
					))}
				</ul>

				{isHost && (
					<button className="btn pause-overlay-end-btn" onClick={onEndGame}>
						Закончить игру
					</button>
				)}
			</div>
		</div>
	);
}

export function GameScreen() {
	const { room, playerId, pauseInfo, send } = useConnection();
	if (!room) {
		return null;
	}

	const isHost = room.hostId === playerId;
	const canEndGame = isHost && room.status === "playing";
	const gameMeta = GAME_META[room.settings.gameId];

	return (
		<div className="screen game-screen">
			<div className="game-topbar">
				<div className="game-topbar-left">
					<button type="button" className="game-back" onClick={() => send({ type: "leaveRoom" })}>
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
					{canEndGame && (
						<button
							type="button"
							className="game-end-btn"
							onClick={() => send({ type: "endGame" })}
						>
							Закончить
						</button>
					)}
				</div>

				{gameMeta && (
					<div className="game-hero">
						<img src="/quokka.svg" alt="" className="game-hero-mascot" aria-hidden="true" />
						<span className="game-hero-title">Квокка</span>
						<span className="game-hero-separator">&middot;</span>
						<span className="game-hero-emoji">{gameMeta.emoji}</span>
						<span className="game-hero-name">{gameMeta.name}</span>
					</div>
				)}

				<div className="game-topbar-right">
					<VoiceControls />
					<RoomCodeButton code={room.code} />
				</div>
			</div>
			{room.settings.gameId === "word-guess" ? (
				<WordGuessGame />
			) : room.settings.gameId === "tapeworm" ? (
				<TapewormGame />
			) : room.settings.gameId === "crocodile" ? (
				<CrocodileGame />
			) : room.settings.gameId === "hangman" ? (
				<HangmanGame />
			) : room.settings.gameId === "mafia" ? (
				<MafiaGame />
			) : room.settings.gameId === "perudo" ? (
				<PerudoGame />
			) : (
				<p className="status-text">Неизвестная игра: {room.settings.gameId}</p>
			)}
			{pauseInfo && (
				<PauseOverlay
					playerName={pauseInfo.disconnectedPlayerName}
					timeoutAt={pauseInfo.timeoutAt}
					players={room.players}
					currentPlayerId={playerId}
					isHost={isHost}
					onEndGame={() => send({ type: "endGame" })}
				/>
			)}
		</div>
	);
}
