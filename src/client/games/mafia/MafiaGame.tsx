import type { MafiaPlayerView } from "@/shared/types/mafia";
import { useConnection } from "../../contexts/ConnectionContext";
import { DayDiscussion } from "./DayDiscussion";
import { DayVoteResult } from "./DayVoteResult";
import { DayVoting } from "./DayVoting";
import { GameOver } from "./GameOver";
import { NightPhase } from "./NightPhase";
import { NightResult } from "./NightResult";
import { RoleReveal } from "./RoleReveal";
import "./Mafia.css";

export function MafiaGame() {
	const { gameState, playerId, send } = useConnection();
	const state = gameState as MafiaPlayerView | null;

	if (!state) {
		return <p className="status-text">Загрузка игры...</p>;
	}

	const dispatch = (action: unknown) => {
		send({ type: "gameAction", action });
	};

	if (state.phase === "roleReveal") {
		return (
			<div className="mafia">
				<RoleReveal state={state} />
			</div>
		);
	}

	if (
		state.phase === "nightMafiaVote" ||
		state.phase === "nightSheriffCheck" ||
		state.phase === "nightDoctorHeal"
	) {
		return (
			<div className="mafia">
				<NightPhase state={state} playerId={playerId} dispatch={dispatch} />
			</div>
		);
	}

	if (state.phase === "nightResult") {
		return (
			<div className="mafia">
				<NightResult state={state} />
			</div>
		);
	}

	if (state.phase === "dayDiscussion") {
		return (
			<div className="mafia">
				<DayDiscussion state={state} playerId={playerId} />
			</div>
		);
	}

	if (state.phase === "dayVoting") {
		return (
			<div className="mafia">
				<DayVoting state={state} playerId={playerId} dispatch={dispatch} />
			</div>
		);
	}

	if (state.phase === "dayVoteResult") {
		return (
			<div className="mafia">
				<DayVoteResult state={state} />
			</div>
		);
	}

	if (state.phase === "gameOver") {
		return (
			<div className="mafia">
				<GameOver state={state} playerId={playerId} />
			</div>
		);
	}

	return <p className="status-text">Неизвестная фаза: {state.phase}</p>;
}
