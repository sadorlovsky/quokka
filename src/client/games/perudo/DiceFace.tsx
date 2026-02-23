interface DiceFaceProps {
	value: number;
	size?: number;
	highlighted?: boolean;
	wild?: boolean;
}

const DOT_POSITIONS: Record<number, [number, number][]> = {
	1: [[20, 20]],
	2: [
		[10, 10],
		[30, 30],
	],
	3: [
		[10, 10],
		[20, 20],
		[30, 30],
	],
	4: [
		[10, 10],
		[30, 10],
		[10, 30],
		[30, 30],
	],
	5: [
		[10, 10],
		[30, 10],
		[20, 20],
		[10, 30],
		[30, 30],
	],
	6: [
		[10, 10],
		[30, 10],
		[10, 20],
		[30, 20],
		[10, 30],
		[30, 30],
	],
};

export function DiceFace({ value, size = 36, highlighted, wild }: DiceFaceProps) {
	const dots = DOT_POSITIONS[value] ?? DOT_POSITIONS[1]!;
	const cls = `perudo-die${highlighted ? " perudo-die--highlighted" : ""}${wild ? " perudo-die--wild" : ""}`;

	return (
		<span className={cls}>
			<svg width={size} height={size} viewBox="0 0 40 40" aria-label={`Кубик: ${value}`}>
				<title>Кубик: {value}</title>
				<rect
					x="2"
					y="2"
					width="36"
					height="36"
					rx="6"
					fill="var(--color-surface-raised)"
					stroke="var(--color-border)"
					strokeWidth="1.5"
				/>
				{dots.map(([cx, cy]) => (
					<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="var(--color-text)" />
				))}
			</svg>
		</span>
	);
}
