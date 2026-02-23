import { useEffect, useRef } from "react";
import type { PerudoBid, PerudoPlayerViewPlayer } from "@/shared/types/perudo";
import { DiceFace } from "./DiceFace";

interface BidHistoryProps {
	bids: PerudoBid[];
	players: PerudoPlayerViewPlayer[];
}

export function BidHistory({ bids, players }: BidHistoryProps) {
	const ref = useRef<HTMLDivElement>(null);

	const bidsCount = bids.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new bids
	useEffect(() => {
		if (ref.current) {
			ref.current.scrollTop = ref.current.scrollHeight;
		}
	}, [bidsCount]);

	if (bids.length === 0) {
		return (
			<div className="perudo-bid-history">
				<span className="perudo-bid-history-empty">Ставок пока нет</span>
			</div>
		);
	}

	return (
		<div className="perudo-bid-history" ref={ref}>
			{bids.map((bid, i) => {
				const player = players.find((p) => p.id === bid.playerId);
				const key = `${bid.playerId}-${bid.quantity}-${bid.faceValue}-${i}`;
				return (
					<div key={key} className="perudo-bid-entry">
						<span className="perudo-bid-player">{player?.name ?? "?"}</span>
						<span className="perudo-bid-value">
							{bid.quantity} x <DiceFace value={bid.faceValue} size={20} />
						</span>
					</div>
				);
			})}
		</div>
	);
}
