import type { WordGuessPlayerView } from "@/shared/types/word-guess";
import { useConnection } from "../../contexts/ConnectionContext";
import { ExplainerView } from "./ExplainerView";
import { GameOver } from "./GameOver";
import { RoundEnd } from "./RoundEnd";
import { ScoreBoard } from "./ScoreBoard";
import { StartingOverlay } from "./StartingOverlay";
import { WatcherView } from "./WatcherView";
import "./WordGuess.css";

export function WordGuessGame() {
	const { gameState, playerId, room, send } = useConnection();
	const state = gameState as WordGuessPlayerView | null;

	if (!state) {
		return <p className="status-text">Загрузка игры...</p>;
	}

	const isHost = room?.hostId === playerId;

	const dispatch = (action: unknown) => {
		send({ type: "gameAction", action });
	};

	if (state.phase === "starting") {
		return (
			<div className="word-guess word-guess--fullscreen">
				<StartingOverlay state={state} />
			</div>
		);
	}

	if (state.phase === "gameOver") {
		return (
			<div className="word-guess word-guess--fullscreen">
				<GameOver
					state={state}
					currentPlayerId={playerId}
					isHost={isHost}
					onReturnToLobby={() => send({ type: "returnToLobby" })}
				/>
			</div>
		);
	}

	if (state.phase === "roundEnd") {
		return (
			<div className="word-guess">
				<ScoreBoard state={state} currentPlayerId={playerId} />
				<RoundEnd
					state={state}
					isHost={isHost}
					onNextRound={() => dispatch({ type: "nextRound" })}
				/>
			</div>
		);
	}

	return (
		<div className="word-guess">
			<ScoreBoard state={state} currentPlayerId={playerId} />
			{state.isExplainer ? (
				<ExplainerView state={state} dispatch={dispatch} />
			) : (
				<WatcherView state={state} dispatch={dispatch} />
			)}
		</div>
	);
}
