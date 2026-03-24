import { useEffect, useState } from "react";
import type { PlayerInfo } from "@/shared/types/room";
import { PlayerChip } from "../components/PlayerChip";
import { useConnection } from "../contexts/ConnectionContext";
import { CrocodileGame } from "../games/crocodile/CrocodileGame";
import { HangmanGame } from "../games/hangman/HangmanGame";
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

	return (
		<div className="screen game-screen">
			<div className="game-header">
				<div className="game-header-actions">
					{canEndGame && (
						<button
							className="btn btn-secondary game-header-btn"
							onClick={() => send({ type: "endGame" })}
						>
							Закончить игру
						</button>
					)}
					<button
						className="btn btn-secondary game-header-btn"
						onClick={() => send({ type: "leaveRoom" })}
					>
						Выйти
					</button>
				</div>
				<span className="room-code-small">{room.code}</span>
			</div>
			{room.settings.gameId === "word-guess" ? (
				<WordGuessGame />
			) : room.settings.gameId === "tapeworm" ? (
				<TapewormGame />
			) : room.settings.gameId === "crocodile" ? (
				<CrocodileGame />
			) : room.settings.gameId === "hangman" ? (
				<HangmanGame />
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
