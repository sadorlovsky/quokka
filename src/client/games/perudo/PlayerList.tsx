import type { PerudoPlayerView } from "@/shared/types/perudo";
import { Avatar } from "../../components/Avatar";

interface PlayerListProps {
	state: PerudoPlayerView;
	currentPlayerId: string | null;
}

export function PlayerList({ state, currentPlayerId }: PlayerListProps) {
	return (
		<div className="perudo-players">
			{state.players.map((player) => {
				const isActive = player.id === state.currentPlayerId && state.phase === "bidding";
				const isMe = player.id === currentPlayerId;

				return (
					<div
						key={player.id}
						className={`perudo-player${isActive ? " perudo-player--active" : ""}${player.isEliminated ? " perudo-player--eliminated" : ""}`}
					>
						<Avatar seed={player.avatarSeed} size="sm" />
						<span className="perudo-player-name">
							{player.name}
							{isMe ? " (я)" : ""}
						</span>
						<span className="perudo-player-dice-count">
							{player.isEliminated
								? "---"
								: `${player.diceCount} ${player.diceCount === 1 ? "кубик" : player.diceCount < 5 ? "кубика" : "кубиков"}`}
						</span>
					</div>
				);
			})}
		</div>
	);
}
