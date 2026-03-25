import type { MafiaPlayerView } from "@/shared/types/mafia";
import { getRoleName } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";

interface NightResultProps {
	state: MafiaPlayerView;
}

export function NightResult({ state }: NightResultProps) {
	return (
		<div className="mafia-overlay mafia-overlay--night-result">
			<p className="mafia-phase-title">🌅 Рассвет — Раунд {state.round}</p>
			<Timer endsAt={state.timerEndsAt} />

			{state.lastNightSaved ? (
				<div className="mafia-result-card mafia-result-card--saved">
					<p className="mafia-result-text">Доктор спас жертву этой ночью!</p>
					<p className="mafia-result-icon">💊</p>
				</div>
			) : state.lastKilled ? (
				<div className="mafia-result-card mafia-result-card--killed">
					<p className="mafia-result-text">Этой ночью был убит:</p>
					<p className="mafia-result-name">{state.lastKilled.name}</p>
					{state.lastKilled.role && (
						<p className="mafia-result-role">{getRoleName(state.lastKilled.role)}</p>
					)}
					<p className="mafia-result-icon">💀</p>
				</div>
			) : (
				<div className="mafia-result-card">
					<p className="mafia-result-text">Этой ночью никто не пострадал</p>
				</div>
			)}
		</div>
	);
}
