import type { HangmanPlayerView } from "@/shared/types/hangman";
import { HangmanFigure } from "./HangmanFigure";
import { ScoreBoard } from "./ScoreBoard";

interface RoundEndProps {
	state: HangmanPlayerView;
	currentPlayerId?: string | null;
}

export function RoundEnd({ state, currentPlayerId }: RoundEndProps) {
	const isWordGuessed = state.roundEndReason === "wordGuessed";

	return (
		<div className="hangman-round-end">
			<HangmanFigure wrongCount={state.wrongCount} />
			<p className="hangman-round-end-result">
				{isWordGuessed ? "Слово угадано!" : "Виселица завершена!"}
			</p>
			<p className="hangman-round-end-word">{state.currentWord}</p>
			{isWordGuessed && state.wordGuessedBy && (
				<p className="hangman-round-end-guesser">Угадал(а): {state.wordGuessedBy}</p>
			)}
			<ScoreBoard state={state} currentPlayerId={currentPlayerId ?? null} />
			<p className="hangman-round-end-next">
				{state.currentRound < state.totalRounds ? "Следующий раунд..." : "Подведение итогов..."}
			</p>
		</div>
	);
}
