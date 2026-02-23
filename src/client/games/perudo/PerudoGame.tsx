import { useEffect, useState } from "react";
import type { PerudoPlayerView } from "@/shared/types/perudo";
import { useConnection } from "../../contexts/ConnectionContext";
import { BidControls } from "./BidControls";
import { BidHistory } from "./BidHistory";
import { DiceArea } from "./DiceArea";
import { DiceFace } from "./DiceFace";
import { GameOver } from "./GameOver";
import { PlayerList } from "./PlayerList";
import { RevealView } from "./RevealView";
import { RoundEnd } from "./RoundEnd";
import { StartingOverlay } from "./StartingOverlay";
import "./Perudo.css";

function Timer({ timerEndsAt }: { timerEndsAt: number }) {
	const [secondsLeft, setSecondsLeft] = useState(() =>
		Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)),
	);

	useEffect(() => {
		setSecondsLeft(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
		const interval = setInterval(() => {
			const left = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
			setSecondsLeft(left);
			if (left <= 0) {
				clearInterval(interval);
			}
		}, 250);
		return () => clearInterval(interval);
	}, [timerEndsAt]);

	if (!timerEndsAt) {
		return null;
	}

	const isUrgent = secondsLeft <= 10;

	return (
		<span className={`perudo-timer${isUrgent ? " perudo-timer--urgent" : ""}`}>{secondsLeft}с</span>
	);
}

export function PerudoGame() {
	const { gameState, playerId, room, send } = useConnection();
	const state = gameState as PerudoPlayerView | null;

	if (!state) {
		return <p className="status-text">Загрузка игры...</p>;
	}

	const isHost = room?.hostId === playerId;
	const dispatch = (action: unknown) => {
		send({ type: "gameAction", action });
	};

	if (state.phase === "starting") {
		return (
			<div className="perudo">
				<StartingOverlay state={state} />
			</div>
		);
	}

	if (state.phase === "gameOver") {
		return (
			<div className="perudo">
				<GameOver
					state={state}
					currentPlayerId={playerId}
					isHost={isHost}
					onReturnToLobby={() => send({ type: "returnToLobby" })}
				/>
			</div>
		);
	}

	if (state.phase === "reveal") {
		return (
			<div className="perudo">
				<RevealView state={state} />
			</div>
		);
	}

	if (state.phase === "roundEnd") {
		return (
			<div className="perudo">
				<RoundEnd state={state} />
			</div>
		);
	}

	// Bidding phase
	const currentPlayer = state.players.find((p) => p.id === state.currentPlayerId);

	return (
		<div className="perudo">
			<PlayerList state={state} currentPlayerId={playerId} />

			{state.isPalificoRound && (
				<div className="perudo-palifico-banner">Палифико! Единицы не джокеры</div>
			)}

			<DiceArea dice={state.myDice} />

			{state.currentBid && (
				<div className="perudo-current-bid">
					<span>Текущая ставка:</span>
					<span className="perudo-current-bid-value">
						{state.currentBid.quantity} x <DiceFace value={state.currentBid.faceValue} size={22} />
					</span>
				</div>
			)}

			<BidHistory bids={state.bidHistory} players={state.players} />

			<Timer timerEndsAt={state.timerEndsAt} />

			{state.isMyTurn ? (
				<BidControls state={state} dispatch={dispatch} />
			) : (
				<div className="perudo-waiting">
					<span>Ход: {currentPlayer?.name ?? "..."}</span>
				</div>
			)}
		</div>
	);
}
