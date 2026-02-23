import { useEffect, useState } from "react";
import type { PerudoPlayerView } from "@/shared/types/perudo";

interface StartingOverlayProps {
	state: PerudoPlayerView;
}

export function StartingOverlay({ state }: StartingOverlayProps) {
	const [secondsLeft, setSecondsLeft] = useState(() =>
		Math.max(1, Math.ceil((state.timerEndsAt - Date.now()) / 1000)),
	);

	useEffect(() => {
		const interval = setInterval(() => {
			const left = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
			setSecondsLeft(left);
			if (left <= 0) {
				clearInterval(interval);
			}
		}, 250);
		return () => clearInterval(interval);
	}, [state.timerEndsAt]);

	return (
		<div className="starting-overlay">
			<p className="starting-overlay-title">Раунд {state.round}</p>
			{state.isPalificoRound && (
				<div className="perudo-palifico-banner">Палифико! Единицы не джокеры</div>
			)}
			<p className="starting-overlay-countdown">{secondsLeft}</p>
		</div>
	);
}
