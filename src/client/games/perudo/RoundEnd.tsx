import type { PerudoPlayerView } from "@/shared/types/perudo";

interface RoundEndProps {
	state: PerudoPlayerView;
}

export function RoundEnd({ state }: RoundEndProps) {
	const loser = state.players.find((p) => p.id === state.challengeLoser);

	return (
		<div className="perudo-round-end">
			<div className="perudo-round-end-title">Итоги раунда {state.round}</div>

			{loser && (
				<>
					<div className="perudo-round-end-detail">
						{loser.name} теряет кубик
						{loser.diceCount > 0 ? ` (осталось: ${loser.diceCount})` : ""}
					</div>
					{loser.isEliminated && (
						<div className="perudo-round-end-eliminated">{loser.name} выбывает из игры!</div>
					)}
				</>
			)}

			<div className="perudo-round-end-detail">Всего кубиков в игре: {state.totalDiceInPlay}</div>
		</div>
	);
}
