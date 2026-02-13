import { useCallback, useState } from "react";

interface WordGuessInputProps {
	dispatch: (action: unknown) => void;
	disabled?: boolean;
}

export function WordGuessInput({ dispatch, disabled }: WordGuessInputProps) {
	const [word, setWord] = useState("");

	const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const filtered = e.target.value.replace(/[^а-яёА-ЯЁ]/g, "");
		setWord(filtered);
	}, []);

	const handleSubmit = useCallback(() => {
		const trimmed = word.trim();
		if (!trimmed) {
			return;
		}
		dispatch({ type: "guessWord", word: trimmed.toLowerCase() });
		setWord("");
	}, [word, dispatch]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div className="hangman-word-guess">
			<input
				className="input hangman-word-guess-input"
				type="text"
				value={word}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder="Угадать слово целиком..."
				disabled={disabled}
			/>
			<button
				className="btn hangman-word-guess-btn"
				onClick={handleSubmit}
				disabled={disabled || !word.trim()}
			>
				Угадать
			</button>
		</div>
	);
}
