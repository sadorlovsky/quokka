import { useEffect, useState } from "react";
import type { HangmanPlayerView } from "@/shared/types/hangman";
import { Avatar } from "../../components/Avatar";

interface StartingOverlayProps {
	state: HangmanPlayerView;
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

	const executioner = state.players.find((p) => p.id === state.currentExecutionerId);

	return (
		<div className="starting-overlay">
			<p className="starting-overlay-title">
				Раунд {state.currentRound} из {state.totalRounds}
			</p>
			{executioner && (
				<div className="hangman-executioner-announce">
					<Avatar seed={executioner.avatarSeed} size="sm" />
					<p className="hangman-executioner-name">
						{state.isExecutioner ? "Вы — палач!" : `Палач: ${executioner.name}`}
					</p>
				</div>
			)}
			<p className="starting-overlay-countdown">{secondsLeft}</p>
		</div>
	);
}
