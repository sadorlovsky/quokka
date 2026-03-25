import type { MafiaPlayerViewPlayer } from "@/shared/types/mafia";
import { getRoleName } from "@/shared/types/mafia";
import { Avatar } from "../../components/Avatar";

interface PlayerGridProps {
	players: MafiaPlayerViewPlayer[];
	myId: string | null;
	/** Player IDs that are selectable targets */
	selectableIds?: string[];
	/** Currently selected player ID */
	selectedId?: string | null;
	/** Vote map: voterId -> targetId (for showing vote indicators) */
	votes?: Record<string, string | "abstain"> | null;
	/** Callback when a player is clicked */
	onSelect?: (playerId: string) => void;
	/** Show role badge */
	showRoles?: boolean;
	/** Highlight mafia members */
	mafiaMembers?: string[] | null;
}

export function PlayerGrid({
	players,
	myId,
	selectableIds,
	selectedId,
	votes,
	onSelect,
	showRoles,
	mafiaMembers,
}: PlayerGridProps) {
	return (
		<div className="mafia-player-grid">
			{players.map((p) => {
				const isMe = p.id === myId;
				const isDead = !p.isAlive;
				const isSelectable = selectableIds?.includes(p.id);
				const isSelected = selectedId === p.id;
				const isMafiaHighlight = mafiaMembers?.includes(p.id);

				// Count votes for this player
				let voteCount = 0;
				if (votes) {
					for (const targetId of Object.values(votes)) {
						if (targetId === p.id) {
							voteCount++;
						}
					}
				}

				const classes = [
					"mafia-player-card",
					isDead && "mafia-player-card--dead",
					isSelectable && "mafia-player-card--selectable",
					isSelected && "mafia-player-card--selected",
					isMafiaHighlight && "mafia-player-card--mafia",
				]
					.filter(Boolean)
					.join(" ");

				return (
					<button
						key={p.id}
						type="button"
						className={classes}
						disabled={!isSelectable}
						onClick={() => isSelectable && onSelect?.(p.id)}
					>
						<Avatar seed={p.avatarSeed} size="md" />
						<span className="mafia-player-name">
							{p.name}
							{isMe && <span className="mafia-player-me"> (вы)</span>}
						</span>
						{showRoles && p.role && (
							<span className={`mafia-role-badge mafia-role-badge--${p.team}`}>
								{getRoleName(p.role)}
							</span>
						)}
						{isDead && (
							<span className="mafia-death-badge">{p.deathCause === "killed" ? "💀" : "⚖️"}</span>
						)}
						{voteCount > 0 && <span className="mafia-vote-count">{voteCount}</span>}
					</button>
				);
			})}
		</div>
	);
}
