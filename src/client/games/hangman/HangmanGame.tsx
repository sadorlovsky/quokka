import type { HangmanPlayerView } from "@/shared/types/hangman";
import { useConnection } from "../../contexts/ConnectionContext";
import { ExecutionerWordInput } from "./ExecutionerWordInput";
import { GameOver } from "./GameOver";
import { GuesserView } from "./GuesserView";
import { RoundEnd } from "./RoundEnd";
import { StartingOverlay } from "./StartingOverlay";
import "./Hangman.css";

export function HangmanGame() {
	const { gameState, playerId, room, send } = useConnection();
	const state = gameState as HangmanPlayerView | null;

	if (!state) {
		return <p className="status-text">Загрузка игры...</p>;
	}

	const isHost = room?.hostId === playerId;

	const dispatch = (action: unknown) => {
		send({ type: "gameAction", action });
	};

	if (state.phase === "starting") {
		return (
			<div className="hangman">
				<StartingOverlay state={state} />
			</div>
		);
	}

	if (state.phase === "pickingWord") {
		if (state.isExecutioner) {
			return (
				<div className="hangman">
					<ExecutionerWordInput dispatch={dispatch} />
				</div>
			);
		}

		const executioner = state.players.find((p) => p.id === state.currentExecutionerId);

		return (
			<div className="hangman">
				<div className="hangman-waiting">
					<p className="hangman-waiting-title">Палач загадывает слово...</p>
					<p className="hangman-waiting-name">{executioner?.name ?? "Палач"}</p>
					<p className="hangman-waiting-hint">
						Существительное, именительный падеж, единственное число
					</p>
				</div>
			</div>
		);
	}

	if (state.phase === "gameOver") {
		return (
			<div className="hangman">
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
			<div className="hangman">
				<RoundEnd state={state} />
			</div>
		);
	}

	return (
		<div className="hangman">
			<GuesserView state={state} dispatch={dispatch} currentPlayerId={playerId} />
		</div>
	);
}
