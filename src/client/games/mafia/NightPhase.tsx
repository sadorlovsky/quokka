import type { MafiaPlayerView } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";
import { PlayerGrid } from "./PlayerGrid";

interface NightPhaseProps {
	state: MafiaPlayerView;
	playerId: string | null;
	dispatch: (action: unknown) => void;
}

export function NightPhase({ state, playerId, dispatch }: NightPhaseProps) {
	const alivePlayers = state.players.filter((p) => p.isAlive);
	const isMafia = state.myTeam === "mafia";
	const isSheriff = state.myRole === "sheriff";
	const isDoctor = state.myRole === "doctor";

	if (state.phase === "nightMafiaVote") {
		if (isMafia && state.isAlive) {
			const selectableIds = alivePlayers
				.filter((p) => !state.mafiaMembers?.includes(p.id))
				.map((p) => p.id);

			const myVote = playerId && state.mafiaVotes ? state.mafiaVotes[playerId] : null;

			return (
				<div className="mafia-overlay mafia-overlay--night">
					<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
					<p className="mafia-phase-subtitle">Выберите жертву</p>
					<Timer endsAt={state.timerEndsAt} />
					<PlayerGrid
						players={alivePlayers}
						myId={playerId}
						selectableIds={myVote ? [] : selectableIds}
						selectedId={myVote}
						votes={state.mafiaVotes}
						onSelect={(targetId) => dispatch({ type: "nightVote", targetId })}
						mafiaMembers={state.mafiaMembers}
					/>
					{myVote && <p className="mafia-action-done">Вы проголосовали</p>}
				</div>
			);
		}

		return (
			<div className="mafia-overlay mafia-overlay--night">
				<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
				<p className="mafia-phase-subtitle">Город спит... Мафия выбирает жертву</p>
				<Timer endsAt={state.timerEndsAt} />
			</div>
		);
	}

	if (state.phase === "nightSheriffCheck") {
		if (isSheriff && state.isAlive) {
			const selectableIds = alivePlayers.filter((p) => p.id !== playerId).map((p) => p.id);

			const hasChecked = state.sheriffResult !== null;

			return (
				<div className="mafia-overlay mafia-overlay--night">
					<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
					<p className="mafia-phase-subtitle">Комиссар: выберите кого проверить</p>
					<Timer endsAt={state.timerEndsAt} />
					<PlayerGrid
						players={alivePlayers}
						myId={playerId}
						selectableIds={hasChecked ? [] : selectableIds}
						selectedId={state.sheriffResult?.targetId}
						onSelect={(targetId) => dispatch({ type: "sheriffCheck", targetId })}
					/>
					{state.sheriffResult && (
						<p
							className={`mafia-check-result mafia-check-result--${state.sheriffResult.isMafia ? "mafia" : "town"}`}
						>
							{state.players.find((p) => p.id === state.sheriffResult!.targetId)?.name}
							{" — "}
							{state.sheriffResult.isMafia ? "Мафия! 🔴" : "Мирный 🟢"}
						</p>
					)}
				</div>
			);
		}

		return (
			<div className="mafia-overlay mafia-overlay--night">
				<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
				<p className="mafia-phase-subtitle">Комиссар ведёт расследование...</p>
				<Timer endsAt={state.timerEndsAt} />
			</div>
		);
	}

	if (state.phase === "nightDoctorHeal") {
		if (isDoctor && state.isAlive) {
			const selectableIds = alivePlayers
				.filter((p) => p.id !== playerId || state.isAlive) // doctor can't self-heal unless config allows
				.map((p) => p.id);

			const hasHealed = !state.canAct;

			return (
				<div className="mafia-overlay mafia-overlay--night">
					<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
					<p className="mafia-phase-subtitle">Доктор: выберите кого вылечить</p>
					<Timer endsAt={state.timerEndsAt} />
					<PlayerGrid
						players={alivePlayers}
						myId={playerId}
						selectableIds={hasHealed ? [] : selectableIds}
						onSelect={(targetId) => dispatch({ type: "doctorHeal", targetId })}
					/>
					{hasHealed && <p className="mafia-action-done">Вы выбрали пациента</p>}
				</div>
			);
		}

		return (
			<div className="mafia-overlay mafia-overlay--night">
				<p className="mafia-phase-title">🌙 Ночь — Раунд {state.round}</p>
				<p className="mafia-phase-subtitle">Доктор выбирает пациента...</p>
				<Timer endsAt={state.timerEndsAt} />
			</div>
		);
	}

	return null;
}
