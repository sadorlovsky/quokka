import type { PerudoPlayerView } from "@/shared/types/perudo";
import { PlayerChip } from "../../components/PlayerChip";

interface GameOverProps {
	state: PerudoPlayerView;
	currentPlayerId: string | null;
	isHost: boolean;
	onReturnToLobby: () => void;
}

export function GameOver({ state, currentPlayerId, isHost, onReturnToLobby }: GameOverProps) {
	const winner = state.players.find((p) => p.id === state.winnerId);
	const isWinner = winner?.id === currentPlayerId;

	// Sort: winner first, then by dice count descending, eliminated last
	const sorted = [...state.players].sort((a, b) => {
		if (a.id === state.winnerId) {
			return -1;
		}
		if (b.id === state.winnerId) {
			return 1;
		}
		if (a.isEliminated && !b.isEliminated) {
			return 1;
		}
		if (!a.isEliminated && b.isEliminated) {
			return -1;
		}
		return b.diceCount - a.diceCount;
	});

	return (
		<div className="game-over">
			<h2>Игра окончена!</h2>

			{winner && (
				<div className="winner-announce">
					<p className="winner-label">{isWinner ? "Вы победили!" : `${winner.name} побеждает!`}</p>
				</div>
			)}

			<div className="final-standings">
				{sorted.map((player, i) => (
					<div key={player.id} className="final-row">
						<span className="final-rank">{i + 1}</span>
						<PlayerChip
							avatarSeed={player.avatarSeed}
							name={player.name}
							isCurrent={player.id === currentPlayerId}
						>
							<span className="score">
								{player.id === state.winnerId ? `${player.diceCount} кубиков` : "выбыл"}
							</span>
						</PlayerChip>
					</div>
				))}
			</div>

			{isHost ? (
				<button className="btn" onClick={onReturnToLobby} type="button">
					В лобби
				</button>
			) : (
				<p className="status-text">Ожидание хоста...</p>
			)}
		</div>
	);
}
