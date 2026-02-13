import type { HangmanPlayerView } from "@/shared/types/hangman";
import { PlayerChip } from "../../components/PlayerChip";

interface ScoreBoardProps {
	state: HangmanPlayerView;
	currentPlayerId: string | null;
}

export function ScoreBoard({ state, currentPlayerId }: ScoreBoardProps) {
	return (
		<div className="hangman-scoreboard">
			{state.players.map((player) => {
				const isExecutioner = player.id === state.currentExecutionerId;
				const isTurn = player.id === state.currentGuesserId;
				const isEliminated = state.eliminatedGuessers.includes(player.id);

				let subtitle: string | undefined;
				if (isExecutioner) {
					subtitle = "палач";
				} else if (isEliminated) {
					subtitle = "выбыл";
				}

				return (
					<PlayerChip
						key={player.id}
						avatarSeed={player.avatarSeed}
						name={player.name}
						isMe={player.id === currentPlayerId}
						isActive={isTurn}
						size="compact"
						subtitle={subtitle}
					>
						<span className="hangman-scoreboard-score">{player.score}</span>
					</PlayerChip>
				);
			})}
		</div>
	);
}
