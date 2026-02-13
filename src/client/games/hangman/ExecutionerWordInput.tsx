import { useCallback, useState } from "react";

interface ExecutionerWordInputProps {
	dispatch: (action: unknown) => void;
}

const WORD_REGEX = /^[а-яё]{3,15}$/i;

export function ExecutionerWordInput({ dispatch }: ExecutionerWordInputProps) {
	const [word, setWord] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const isValid = WORD_REGEX.test(word);

	const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		// Filter to Cyrillic only
		const filtered = e.target.value.replace(/[^а-яёА-ЯЁ]/g, "").slice(0, 15);
		setWord(filtered);
	}, []);

	const handleSubmit = useCallback(() => {
		if (!isValid || submitted) {
			return;
		}
		setSubmitted(true);
		dispatch({ type: "submitWord", word: word.toLowerCase() });
	}, [isValid, submitted, word, dispatch]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div className="hangman-word-input">
			<p className="hangman-word-input-title">Вы — палач!</p>
			<p className="hangman-word-input-hint">Загадайте слово (от 3 до 15 букв, только кириллица)</p>
			<p className="hangman-word-input-hint">
				Существительное, именительный падеж, единственное число
			</p>
			<div className="hangman-word-input-field">
				<input
					className="input"
					type="text"
					value={word}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					placeholder="Введите слово..."
					disabled={submitted}
					maxLength={15}
				/>
				<span className="hangman-word-input-count">{word.length}/15</span>
			</div>
			<button className="btn" onClick={handleSubmit} disabled={!isValid || submitted}>
				{submitted ? "Отправлено..." : "Загадать"}
			</button>
		</div>
	);
}
