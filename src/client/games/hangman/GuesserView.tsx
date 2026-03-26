import { useEffect, useState } from "react";
import type { HangmanPlayerView } from "@/shared/types/hangman";
import { HangmanFigure } from "./HangmanFigure";
import { Keyboard } from "./Keyboard";
import { WordGuessInput } from "./WordGuessInput";

interface GuesserViewProps {
	state: HangmanPlayerView;
	dispatch: (action: unknown) => void;
	currentPlayerId: string | null;
}

export function GuesserView({ state, dispatch, currentPlayerId }: GuesserViewProps) {
	const handleGuess = (letter: string) => {
		dispatch({ type: "guessLetter", letter });
	};

	const isEliminated =
		currentPlayerId != null && state.eliminatedGuessers.includes(currentPlayerId);

	const currentGuesser = state.players.find((p) => p.id === state.currentGuesserId);

	// Only filter actual single-letter wrong guesses for keyboard display
	const wrongLettersForKeyboard = state.wrongLetters.filter((l) => l.length === 1);

	return (
		<div className="hangman-play">
			<p className="hangman-round-info">
				Раунд {state.currentRound} из {state.totalRounds}
			</p>

			<div className="hangman-play-top">
				<HangmanFigure wrongCount={state.wrongCount} />
				<p className="hangman-masked-word">{state.maskedWord}</p>
			</div>

			<p className="hangman-errors">
				{state.wrongCount} / {state.maxErrors}
			</p>

			{state.isExecutioner ? (
				<div className="hangman-watching">
					<p className="hangman-watching-word">
						Ваше слово: <strong>{state.currentWord}</strong>
					</p>
					{currentGuesser && <p className="hangman-watching-turn">Ход: {currentGuesser.name}</p>}
					<TurnTimer timerEndsAt={state.timerEndsAt} />
				</div>
			) : isEliminated ? (
				<div className="hangman-eliminated">
					<p>Вы выбыли из этого раунда</p>
				</div>
			) : (
				<>
					{state.isMyTurn ? (
						<div className="hangman-my-turn">
							<p className="hangman-turn-label">Ваш ход!</p>
							<TurnTimer timerEndsAt={state.timerEndsAt} />
						</div>
					) : (
						<div className="hangman-other-turn">
							{currentGuesser && <p className="hangman-turn-label">Ход: {currentGuesser.name}</p>}
							<TurnTimer timerEndsAt={state.timerEndsAt} />
						</div>
					)}

					<Keyboard
						guessedLetters={state.guessedLetters}
						wrongLetters={wrongLettersForKeyboard}
						onGuess={handleGuess}
						disabled={!state.isMyTurn}
					/>

					<WordGuessInput dispatch={dispatch} disabled={!state.isMyTurn} />
				</>
			)}
		</div>
	);
}

function TurnTimer({ timerEndsAt }: { timerEndsAt: number }) {
	const [secondsLeft, setSecondsLeft] = useState(() =>
		Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)),
	);

	useEffect(() => {
		setSecondsLeft(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
		const interval = setInterval(() => {
			const left = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
			setSecondsLeft(left);
			if (left <= 0) {
				clearInterval(interval);
			}
		}, 250);
		return () => clearInterval(interval);
	}, [timerEndsAt]);

	if (!timerEndsAt) {
		return null;
	}

	const isUrgent = secondsLeft <= 5;

	return (
		<span className={`hangman-timer${isUrgent ? " hangman-timer--urgent" : ""}`}>
			{secondsLeft}с
		</span>
	);
}
