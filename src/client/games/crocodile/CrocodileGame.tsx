import type { CrocodilePlayerView } from "@/shared/types/crocodile";
import { useConnection } from "../../contexts/ConnectionContext";
import { GameOver } from "./GameOver";
import { GuesserView } from "./GuesserView";
import { RoundEnd } from "./RoundEnd";
import { ScoreBoard } from "./ScoreBoard";
import { ShowerView } from "./ShowerView";
import { StartingOverlay } from "./StartingOverlay";
import "./Crocodile.css";

export function CrocodileGame() {
	const { gameState, playerId, room, send } = useConnection();
	const state = gameState as CrocodilePlayerView | null;

	if (!state) {
		return <p className="status-text">Загрузка игры...</p>;
	}

	const isHost = room?.hostId === playerId;

	const dispatch = (action: unknown) => {
		send({ type: "gameAction", action });
	};

	if (state.phase === "starting") {
		return (
			<div className="crocodile crocodile--fullscreen">
				<StartingOverlay state={state} />
			</div>
		);
	}

	if (state.phase === "gameOver") {
		return (
			<div className="crocodile crocodile--fullscreen">
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
			<div className="crocodile">
				<ScoreBoard state={state} currentPlayerId={playerId} />
				<RoundEnd state={state} />
			</div>
		);
	}

	return (
		<div className="crocodile">
			<ScoreBoard state={state} currentPlayerId={playerId} />
			{state.isShower ? (
				<ShowerView state={state} dispatch={dispatch} />
			) : (
				<GuesserView state={state} dispatch={dispatch} />
			)}
		</div>
	);
}
