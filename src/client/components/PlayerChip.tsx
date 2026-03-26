import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import "./PlayerChip.css";

interface PlayerChipProps {
	avatarSeed: number;
	name: string;
	isMe?: boolean;
	isHost?: boolean;
	isActive?: boolean;
	isCurrent?: boolean;
	disconnected?: boolean;
	speaking?: boolean;
	muted?: boolean;
	inVoice?: boolean;
	subtitle?: string;
	size?: "default" | "compact";
	children?: ReactNode;
}

export function PlayerChip({
	avatarSeed,
	name,
	isMe,
	isHost,
	isActive,
	isCurrent,
	disconnected,
	speaking,
	muted,
	inVoice,
	subtitle,
	size = "default",
	children,
}: PlayerChipProps) {
	const classes = [
		"player-chip",
		size === "compact" && "player-chip--compact",
		isActive && "player-chip--active",
		isCurrent && "player-chip--current",
		disconnected && "player-chip--disconnected",
		speaking && "player-chip--speaking",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={classes}>
			<Avatar seed={avatarSeed} size="sm" />
			<div className="player-chip-info">
				<span className="player-chip-name">
					{name}
					{isMe && <span className="badge you-badge">вы</span>}
					{isHost && <span className="badge host-badge">хост</span>}
				</span>
				{subtitle && <span className="player-chip-subtitle">{subtitle}</span>}
			</div>
			{muted ? (
				<div className="player-chip-muted" role="img" aria-label="Muted">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Микрофон выключен</title>
						<line x1="2" x2="22" y1="2" y2="22" />
						<path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
						<path d="M5 10v2a7 7 0 0 0 12 5.29" />
						<path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
						<path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
						<line x1="12" x2="12" y1="19" y2="22" />
					</svg>
				</div>
			) : speaking ? (
				<div className="player-chip-voice" role="img" aria-label="Speaking">
					<span className="player-chip-voice-bar" />
					<span className="player-chip-voice-bar" />
					<span className="player-chip-voice-bar" />
					<span className="player-chip-voice-bar" />
				</div>
			) : (
				inVoice && (
					<div className="player-chip-in-voice" role="img" aria-label="In voice chat">
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>В голосовом чате</title>
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
							<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
							<line x1="12" x2="12" y1="19" y2="22" />
						</svg>
					</div>
				)
			)}
			{children && <div className="player-chip-slot">{children}</div>}
		</div>
	);
}
