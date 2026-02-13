interface KeyboardProps {
	guessedLetters: string[];
	wrongLetters: string[];
	onGuess: (letter: string) => void;
	disabled?: boolean;
}

const RU_ROWS = [
	["а", "б", "в", "г", "д", "е", "ж", "з", "и", "й", "к"],
	["л", "м", "н", "о", "п", "р", "с", "т", "у", "ф", "х"],
	["ц", "ч", "ш", "щ", "ъ", "ы", "ь", "э", "ю", "я", "ё"],
];

export function Keyboard({ guessedLetters, wrongLetters, onGuess, disabled }: KeyboardProps) {
	return (
		<div className="hangman-keyboard">
			{RU_ROWS.map((row) => (
				<div key={row.join("")} className="hangman-keyboard-row">
					{row.map((letter) => {
						const isGuessed = guessedLetters.includes(letter);
						const isWrong = wrongLetters.includes(letter);
						const isUsed = isGuessed || isWrong;

						const classes = [
							"hangman-key",
							isGuessed && "hangman-key--correct",
							isWrong && "hangman-key--wrong",
						]
							.filter(Boolean)
							.join(" ");

						return (
							<button
								key={letter}
								className={classes}
								disabled={isUsed || disabled}
								onClick={() => onGuess(letter)}
							>
								{letter}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
