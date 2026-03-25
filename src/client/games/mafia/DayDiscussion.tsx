import type { MafiaPlayerView } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";
import { PlayerGrid } from "./PlayerGrid";

interface DayDiscussionProps {
	state: MafiaPlayerView;
	playerId: string | null;
}

export function DayDiscussion({ state, playerId }: DayDiscussionProps) {
	return (
		<div className="mafia-day">
			<p className="mafia-phase-title">☀️ День — Раунд {state.round}</p>
			<p className="mafia-phase-subtitle">Обсуждение: кто мафия?</p>
			<Timer endsAt={state.timerEndsAt} />
			<PlayerGrid
				players={state.players}
				myId={playerId}
				showRoles={false}
				mafiaMembers={state.mafiaMembers}
			/>
		</div>
	);
}
