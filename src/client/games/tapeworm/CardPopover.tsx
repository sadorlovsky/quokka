import type { CardTrait, HandCard } from "@/shared/types/tapeworm";
import { CardView } from "./CardView";

type DescribedTrait = Exclude<CardTrait, "START">;

const TRAIT_DESCRIPTIONS: Record<DescribedTrait, { icon: string; name: string; desc: string }> = {
	DIG: { icon: "⛏️", name: "Копать", desc: "Сбросьте карту из руки" },
	SWAP: {
		icon: "🔄",
		name: "Обмен",
		desc: "Обменяйтесь картой с другим игроком",
	},
	HATCH: {
		icon: "🐣",
		name: "Вылупление",
		desc: "Заставьте игрока взять карту из колоды",
	},
	PEEK: {
		icon: "👁️",
		name: "Подсмотреть",
		desc: "Верните карту на верх колоды",
	},
	CUT: {
		icon: "✂️",
		name: "Разрезать",
		desc: "Разрежьте червя, отсоединённые части удаляются",
	},
};

interface CardPopoverProps {
	card: HandCard;
	onClose: () => void;
}

export function CardPopover({ card, onClose }: CardPopoverProps) {
	const { card: def } = card;
	const isKnife = def.type === "knife";
	const property = def.property;
	const trait = property?.trait;
	const traitInfo = trait && trait !== "START" ? TRAIT_DESCRIPTIONS[trait as DescribedTrait] : null;

	return (
		<div className="tapeworm-popover-backdrop" onClick={onClose}>
			<div className="tapeworm-popover" onClick={(e) => e.stopPropagation()}>
				<CardView card={def} size={160} />

				{isKnife && (
					<div className="tapeworm-popover-desc">
						<span className="tapeworm-popover-icon">✂️</span>
						<div>
							<div className="tapeworm-popover-trait">Нож</div>
							<div className="tapeworm-popover-text">
								Разрежьте червя, отсоединённые части удаляются
							</div>
						</div>
					</div>
				)}

				{traitInfo && (
					<div className="tapeworm-popover-desc">
						<span className="tapeworm-popover-icon">{traitInfo.icon}</span>
						<div>
							<div className="tapeworm-popover-trait">
								{traitInfo.name}
								{property!.multiplier > 1 && (
									<span className="tapeworm-popover-x2"> x{property!.multiplier}</span>
								)}
							</div>
							<div className="tapeworm-popover-text">
								{traitInfo.desc}
								{property!.multiplier > 1 && " (срабатывает дважды)"}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
