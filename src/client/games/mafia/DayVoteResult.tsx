import type { MafiaPlayerView } from "@/shared/types/mafia";
import { getRoleName } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";

interface DayVoteResultProps {
	state: MafiaPlayerView;
}

export function DayVoteResult({ state }: DayVoteResultProps) {
	return (
		<div className="mafia-overlay mafia-overlay--vote-result">
			<p className="mafia-phase-title">⚖️ Результат голосования</p>
			<Timer endsAt={state.timerEndsAt} />

			{state.dayVoteTied ? (
				<div className="mafia-result-card">
					<p className="mafia-result-text">Ничья — никто не изгнан</p>
				</div>
			) : state.lastKilled ? (
				<div className="mafia-result-card mafia-result-card--voted">
					<p className="mafia-result-text">Город решил изгнать:</p>
					<p className="mafia-result-name">{state.lastKilled.name}</p>
					{state.lastKilled.role && (
						<p className="mafia-result-role">{getRoleName(state.lastKilled.role)}</p>
					)}
					<p className="mafia-result-icon">⚖️</p>
				</div>
			) : (
				<div className="mafia-result-card">
					<p className="mafia-result-text">Никто не изгнан</p>
				</div>
			)}
		</div>
	);
}
