import type { HangmanPlayerView } from "@/shared/types/hangman";
import { PlayerChip } from "../../components/PlayerChip";
import { plural } from "../../utils/plural";

interface GameOverProps {
	state: HangmanPlayerView;
	currentPlayerId: string | null;
	isHost: boolean;
	onReturnToLobby: () => void;
}

export function GameOver({ state, currentPlayerId, isHost, onReturnToLobby }: GameOverProps) {
	const sorted = [...state.players].sort((a, b) => b.score - a.score);
	const winner = sorted[0];
	const isWinner = winner?.id === currentPlayerId;

	return (
		<div className="game-over">
			<h2>Игра окончена!</h2>

			{winner && (
				<div className="winner-announce">
					<p className="winner-label">{isWinner ? "Вы победили!" : `${winner.name} побеждает!`}</p>
					<p className="winner-score">{plural(winner.score, "очко", "очка", "очков")}</p>
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
							<span className="score">{player.score}</span>
						</PlayerChip>
					</div>
				))}
			</div>

			{isHost ? (
				<button className="btn" onClick={onReturnToLobby}>
					В лобби
				</button>
			) : (
				<p className="status-text">Ожидание хоста...</p>
			)}
		</div>
	);
}
