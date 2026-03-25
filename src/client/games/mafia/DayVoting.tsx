import type { MafiaPlayerView } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";
import { PlayerGrid } from "./PlayerGrid";

interface DayVotingProps {
	state: MafiaPlayerView;
	playerId: string | null;
	dispatch: (action: unknown) => void;
}

export function DayVoting({ state, playerId, dispatch }: DayVotingProps) {
	const hasVoted = playerId ? playerId in (state.dayVotes || {}) : false;
	const alivePlayers = state.players.filter((p) => p.isAlive);
	const selectableIds = state.canAct
		? alivePlayers.filter((p) => p.id !== playerId).map((p) => p.id)
		: [];

	const myVote = playerId && state.dayVotes ? state.dayVotes[playerId] : null;

	return (
		<div className="mafia-day">
			<p className="mafia-phase-title">⚖️ Голосование — Раунд {state.round}</p>
			<p className="mafia-phase-subtitle">
				{state.isAlive ? "Выберите кого изгнать" : "Наблюдайте за голосованием"}
			</p>
			<Timer endsAt={state.timerEndsAt} />
			<PlayerGrid
				players={alivePlayers}
				myId={playerId}
				selectableIds={selectableIds}
				selectedId={myVote && myVote !== "abstain" ? myVote : null}
				votes={state.dayVotes}
				onSelect={(targetId) => dispatch({ type: "dayVote", targetId })}
			/>
			{state.isAlive && !hasVoted && (
				<button
					type="button"
					className="btn mafia-abstain-btn"
					onClick={() => dispatch({ type: "dayVote", targetId: "abstain" })}
				>
					Воздержаться
				</button>
			)}
			{hasVoted && (
				<p className="mafia-action-done">
					{myVote === "abstain" ? "Вы воздержались" : "Вы проголосовали"}
				</p>
			)}
		</div>
	);
}
