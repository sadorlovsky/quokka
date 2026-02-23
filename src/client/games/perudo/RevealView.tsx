import type { PerudoPlayerView } from "@/shared/types/perudo";
import { DiceFace } from "./DiceFace";

interface RevealViewProps {
	state: PerudoPlayerView;
}

export function RevealView({ state }: RevealViewProps) {
	const bid = state.challengedBid;
	if (!bid) {
		return null;
	}

	const bidderWasRight = (state.actualCount ?? 0) >= bid.quantity;
	const challenger = state.players.find((p) => p.id === state.challengerId);
	const bidder = state.players.find((p) => p.id === bid.playerId);
	const loser = state.players.find((p) => p.id === state.challengeLoser);

	return (
		<div className="perudo-reveal">
			<div className="perudo-reveal-title">Дудо!</div>

			<div className="perudo-reveal-bid">
				<span>{bidder?.name ?? "?"} ставил:</span>
				<span className="perudo-current-bid-value">
					{bid.quantity} x <DiceFace value={bid.faceValue} size={22} />
				</span>
			</div>

			<div className="perudo-reveal-bid">
				<span>{challenger?.name ?? "?"} вызвал дудо</span>
			</div>

			<div
				className={`perudo-reveal-count ${bidderWasRight ? "perudo-reveal-count--correct" : "perudo-reveal-count--wrong"}`}
			>
				На самом деле: {state.actualCount ?? 0} x{" "}
				<DiceFace value={bid.faceValue} size={22} highlighted />
			</div>

			<div
				className={`perudo-reveal-result ${bidderWasRight ? "perudo-reveal-result--win" : "perudo-reveal-result--lose"}`}
			>
				{bidderWasRight
					? `${bidder?.name} был прав! ${challenger?.name} теряет кубик`
					: `${bidder?.name} блефовал! ${bidder?.name} теряет кубик`}
			</div>

			<div className="perudo-reveal-players">
				{state.players
					.filter((p) => !p.isEliminated || p.id === loser?.id)
					.map((player) => (
						<div key={player.id} className="perudo-reveal-player">
							<span className="perudo-reveal-player-name">{player.name}</span>
							<div className="perudo-reveal-player-dice">
								{(player.dice ?? []).map((die, i) => {
									const isMatch =
										die === bid.faceValue ||
										(!state.isPalificoRound && bid.faceValue !== 1 && die === 1);
									return (
										<DiceFace
											// biome-ignore lint/suspicious/noArrayIndexKey: dice order is stable
											key={i}
											value={die}
											size={28}
											highlighted={isMatch}
											wild={isMatch && die === 1 && bid.faceValue !== 1}
										/>
									);
								})}
							</div>
						</div>
					))}
			</div>
		</div>
	);
}
