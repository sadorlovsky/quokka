import type { MafiaPlayerView } from "@/shared/types/mafia";
import { getTeamName } from "@/shared/types/mafia";
import { PlayerGrid } from "./PlayerGrid";

interface GameOverProps {
	state: MafiaPlayerView;
	playerId: string | null;
}

export function GameOver({ state, playerId }: GameOverProps) {
	const winnerName = state.winner ? getTeamName(state.winner) : "???";
	const iWon = state.winner === state.myTeam;

	return (
		<div className="mafia-game-over">
			<p className={`mafia-game-over-title mafia-game-over-title--${state.winner}`}>
				{iWon ? "Победа!" : "Поражение"}
			</p>
			<p className="mafia-game-over-team">Победила команда: {winnerName}</p>
			<p className="mafia-game-over-subtitle">Все роли раскрыты</p>
			<PlayerGrid players={state.players} myId={playerId} showRoles />
		</div>
	);
}
