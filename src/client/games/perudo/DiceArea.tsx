import { DiceFace } from "./DiceFace";

interface DiceAreaProps {
	dice: number[];
}

export function DiceArea({ dice }: DiceAreaProps) {
	if (dice.length === 0) {
		return null;
	}

	return (
		<div className="perudo-dice-area">
			<span className="perudo-dice-area-label">Мои кубики</span>
			<div className="perudo-dice-row">
				{dice.map((value, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: dice order is stable
					<DiceFace key={i} value={value} size={44} />
				))}
			</div>
		</div>
	);
}
