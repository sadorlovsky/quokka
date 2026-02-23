import { useCallback, useState } from "react";
import type { PerudoPlayerView } from "@/shared/types/perudo";
import { DiceFace } from "./DiceFace";

interface BidControlsProps {
	state: PerudoPlayerView;
	dispatch: (action: unknown) => void;
}

function getMinValidBid(state: PerudoPlayerView): { quantity: number; faceValue: number } {
	const bid = state.currentBid;
	if (!bid) {
		return { quantity: 1, faceValue: 2 };
	}

	if (state.isPalificoRound) {
		// Same face, quantity + 1
		return { quantity: bid.quantity + 1, faceValue: bid.faceValue };
	}

	// Default: same quantity, next face value, or quantity + 1 at face 2
	if (bid.faceValue < 6) {
		return { quantity: bid.quantity, faceValue: bid.faceValue + 1 };
	}
	return { quantity: bid.quantity + 1, faceValue: 2 };
}

function isValidBid(
	currentBid: PerudoPlayerView["currentBid"],
	quantity: number,
	faceValue: number,
	isPalifico: boolean,
): boolean {
	if (quantity < 1 || faceValue < 1 || faceValue > 6) {
		return false;
	}
	if (!currentBid) {
		return true;
	}

	if (isPalifico) {
		if (faceValue === currentBid.faceValue) {
			return quantity > currentBid.quantity;
		}
		if (faceValue > currentBid.faceValue) {
			return quantity >= currentBid.quantity;
		}
		return false;
	}

	if (currentBid.faceValue === 1) {
		if (faceValue === 1) {
			return quantity > currentBid.quantity;
		}
		return quantity >= currentBid.quantity * 2 + 1;
	}

	if (faceValue === 1) {
		return quantity >= Math.ceil(currentBid.quantity / 2);
	}

	if (quantity > currentBid.quantity) {
		return true;
	}
	if (quantity === currentBid.quantity && faceValue > currentBid.faceValue) {
		return true;
	}
	return false;
}

export function BidControls({ state, dispatch }: BidControlsProps) {
	const min = getMinValidBid(state);
	const [quantity, setQuantity] = useState(min.quantity);
	const [faceValue, setFaceValue] = useState(min.faceValue);

	// Sync defaults when current bid changes
	const bidLen = state.bidHistory.length;
	const [lastBidLen, setLastBidLen] = useState(bidLen);
	if (bidLen !== lastBidLen) {
		setLastBidLen(bidLen);
		const newMin = getMinValidBid(state);
		setQuantity(newMin.quantity);
		setFaceValue(newMin.faceValue);
	}

	const valid = isValidBid(state.currentBid, quantity, faceValue, state.isPalificoRound);
	const canDudo = !!state.currentBid;

	const handleBid = useCallback(() => {
		if (!valid) {
			return;
		}
		dispatch({ type: "bid", quantity, faceValue });
	}, [dispatch, quantity, faceValue, valid]);

	const handleDudo = useCallback(() => {
		dispatch({ type: "dudo" });
	}, [dispatch]);

	return (
		<div className="perudo-bid-controls">
			<div className="perudo-bid-selectors">
				<div className="perudo-bid-group">
					<span className="perudo-bid-label">Кол-во</span>
					<div className="perudo-quantity-control">
						<button
							className="perudo-quantity-btn"
							type="button"
							onClick={() => setQuantity((q) => Math.max(1, q - 1))}
							disabled={quantity <= 1}
						>
							-
						</button>
						<span className="perudo-quantity-value">{quantity}</span>
						<button
							className="perudo-quantity-btn"
							type="button"
							onClick={() => setQuantity((q) => q + 1)}
							disabled={quantity >= state.totalDiceInPlay}
						>
							+
						</button>
					</div>
				</div>

				<div className="perudo-bid-group">
					<span className="perudo-bid-label">Номинал</span>
					<div className="perudo-face-selector">
						{[1, 2, 3, 4, 5, 6].map((face) => (
							<button
								key={face}
								type="button"
								className={`perudo-face-option${faceValue === face ? " perudo-face-option--selected" : ""}`}
								onClick={() => setFaceValue(face)}
							>
								<DiceFace value={face} size={20} />
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="perudo-bid-actions">
				<button className="btn btn-primary" disabled={!valid} onClick={handleBid} type="button">
					Ставка: {quantity} x {faceValue}
				</button>
				{canDudo && (
					<button className="btn perudo-dudo-btn" onClick={handleDudo} type="button">
						Дудо!
					</button>
				)}
			</div>
		</div>
	);
}
