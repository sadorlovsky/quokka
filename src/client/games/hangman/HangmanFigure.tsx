interface HangmanFigureProps {
	wrongCount: number;
}

export function HangmanFigure({ wrongCount }: HangmanFigureProps) {
	return (
		<svg viewBox="0 0 200 220" className="hangman-figure" role="img" aria-label="Виселица">
			{/* Gallows */}
			<line x1="20" y1="210" x2="180" y2="210" stroke="currentColor" strokeWidth="3" />
			<line x1="60" y1="210" x2="60" y2="20" stroke="currentColor" strokeWidth="3" />
			<line x1="60" y1="20" x2="140" y2="20" stroke="currentColor" strokeWidth="3" />
			<line x1="140" y1="20" x2="140" y2="50" stroke="currentColor" strokeWidth="3" />

			{/* Head */}
			{wrongCount >= 1 && (
				<circle cx="140" cy="70" r="20" stroke="currentColor" strokeWidth="3" fill="none" />
			)}
			{/* Body */}
			{wrongCount >= 2 && (
				<line x1="140" y1="90" x2="140" y2="150" stroke="currentColor" strokeWidth="3" />
			)}
			{/* Left arm */}
			{wrongCount >= 3 && (
				<line x1="140" y1="110" x2="110" y2="135" stroke="currentColor" strokeWidth="3" />
			)}
			{/* Right arm */}
			{wrongCount >= 4 && (
				<line x1="140" y1="110" x2="170" y2="135" stroke="currentColor" strokeWidth="3" />
			)}
			{/* Left leg */}
			{wrongCount >= 5 && (
				<line x1="140" y1="150" x2="110" y2="185" stroke="currentColor" strokeWidth="3" />
			)}
			{/* Right leg */}
			{wrongCount >= 6 && (
				<line x1="140" y1="150" x2="170" y2="185" stroke="currentColor" strokeWidth="3" />
			)}
		</svg>
	);
}
