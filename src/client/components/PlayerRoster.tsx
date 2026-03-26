import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	TouchSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { PlayerInfo } from "@/shared/types/room";
import { PlayerChip } from "./PlayerChip";
import "./PlayerRoster.css";

interface PlayerRosterProps {
	players: PlayerInfo[];
	currentPlayerId: string | null;
	mode: "ffa" | "teams";
	teams: Record<string, string[]>;
	isHost: boolean;
	speakingPeerIds?: Set<string>;
	mutedPeerIds?: Set<string>;
	onUpdateTeams: (teams: Record<string, string[]>) => void;
	onSwitchTeam: (teamId: string) => void;
	onKick?: (playerId: string) => void;
}

export function PlayerRoster({
	players,
	currentPlayerId,
	mode,
	teams,
	isHost,
	speakingPeerIds,
	mutedPeerIds,
	onUpdateTeams,
	onSwitchTeam,
	onKick,
}: PlayerRosterProps) {
	if (mode === "ffa") {
		return (
			<ul className="player-list">
				{players.map((player) => (
					<li key={player.id} className="player-list-item">
						<PlayerChip
							avatarSeed={player.avatarSeed}
							name={player.name}
							isMe={player.id === currentPlayerId}
							isHost={player.isHost}
							isCurrent={player.id === currentPlayerId}
							disconnected={!player.isConnected}
							speaking={speakingPeerIds?.has(player.id)}
							muted={mutedPeerIds?.has(player.id)}
						>
							{!player.isConnected && <span className="player-status">не в сети</span>}
						</PlayerChip>
						{isHost && player.id !== currentPlayerId && onKick && (
							<button className="btn-kick" onClick={() => onKick(player.id)} title="Кикнуть">
								✕
							</button>
						)}
					</li>
				))}
			</ul>
		);
	}

	return (
		<TeamsView
			players={players}
			currentPlayerId={currentPlayerId}
			teams={teams}
			isHost={isHost}
			speakingPeerIds={speakingPeerIds}
			mutedPeerIds={mutedPeerIds}
			onUpdate={onUpdateTeams}
			onSwitchTeam={onSwitchTeam}
			onKick={onKick}
		/>
	);
}

// --- Teams View (formerly TeamAssignment) ---

interface TeamsViewProps {
	players: PlayerInfo[];
	teams: Record<string, string[]>;
	isHost: boolean;
	currentPlayerId: string | null;
	speakingPeerIds?: Set<string>;
	mutedPeerIds?: Set<string>;
	onUpdate: (teams: Record<string, string[]>) => void;
	onSwitchTeam: (teamId: string) => void;
	onKick?: (playerId: string) => void;
}

function TeamsView({
	players,
	teams,
	isHost,
	currentPlayerId,
	speakingPeerIds,
	mutedPeerIds,
	onUpdate,
	onSwitchTeam,
	onKick,
}: TeamsViewProps) {
	const teamIds = Object.keys(teams);
	const assigned = new Set(teamIds.flatMap((tid) => teams[tid]!));
	const unassigned = players.filter((p) => !assigned.has(p.id));
	const [activeId, setActiveId] = useState<string | null>(null);

	const getPlayer = (id: string) => players.find((p) => p.id === id);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 150, tolerance: 5 },
		}),
	);

	const canDrag = (playerId: string) => {
		if (isHost) {
			return true;
		}
		return playerId === currentPlayerId;
	};

	const movePlayer = (playerId: string, toTeamId: string) => {
		if (isHost) {
			const updated: Record<string, string[]> = {};
			for (const tid of teamIds) {
				updated[tid] = teams[tid]!.filter((id) => id !== playerId);
			}
			updated[toTeamId] = [...(updated[toTeamId] ?? []), playerId];
			onUpdate(updated);
		} else if (playerId === currentPlayerId) {
			onSwitchTeam(toTeamId);
		}
	};

	const autoSplit = () => {
		const ids = players.map((p) => p.id);
		const shuffled = [...ids].sort(() => Math.random() - 0.5);
		const updated: Record<string, string[]> = {};
		for (const tid of teamIds) {
			updated[tid] = [];
		}
		shuffled.forEach((id, i) => {
			const tid = teamIds[i % teamIds.length]!;
			updated[tid]!.push(id);
		});
		onUpdate(updated);
	};

	const findContainer = (playerId: string): string | null => {
		for (const tid of teamIds) {
			if (teams[tid]!.includes(playerId)) {
				return tid;
			}
		}
		if (unassigned.some((p) => p.id === playerId)) {
			return "__unassigned__";
		}
		return null;
	};

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(String(event.active.id));
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);

		if (!over) {
			return;
		}

		const playerId = String(active.id);
		if (!canDrag(playerId)) {
			return;
		}

		const overId = String(over.id);

		let targetTeamId: string | null = null;

		if (teamIds.includes(overId)) {
			targetTeamId = overId;
		} else {
			targetTeamId = findContainer(overId);
		}

		if (!targetTeamId || targetTeamId === "__unassigned__") {
			return;
		}

		const sourceTeamId = findContainer(playerId);
		if (sourceTeamId === targetTeamId) {
			return;
		}

		movePlayer(playerId, targetTeamId);
	};

	const currentTeamId = teamIds.find((tid) => teams[tid]!.includes(currentPlayerId ?? ""));

	const activePlayer = activeId ? getPlayer(activeId) : null;

	return (
		<div className="team-assignment">
			<div className="team-assignment-header">
				{isHost && (
					<button className="btn-small" onClick={autoSplit}>
						Автораспределение
					</button>
				)}
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div className="team-columns">
					{teamIds.map((teamId, index) => (
						<TeamColumn
							key={teamId}
							teamId={teamId}
							index={index}
							playerIds={teams[teamId]!}
							getPlayer={getPlayer}
							currentPlayerId={currentPlayerId}
							currentTeamId={currentTeamId}
							isHost={isHost}
							speakingPeerIds={speakingPeerIds}
							mutedPeerIds={mutedPeerIds}
							canDrag={canDrag}
							onSwitchTeam={onSwitchTeam}
							onKick={onKick}
						/>
					))}
				</div>

				{unassigned.length > 0 && (
					<UnassignedZone
						players={unassigned}
						currentPlayerId={currentPlayerId}
						isHost={isHost}
						speakingPeerIds={speakingPeerIds}
						mutedPeerIds={mutedPeerIds}
						canDrag={canDrag}
						teamIds={teamIds}
						movePlayer={movePlayer}
						onSwitchTeam={onSwitchTeam}
					/>
				)}

				<DragOverlay dropAnimation={null}>
					{activePlayer && (
						<div className="team-player team-player--dragging">
							<PlayerChip avatarSeed={activePlayer.avatarSeed} name={activePlayer.name} />
						</div>
					)}
				</DragOverlay>
			</DndContext>
		</div>
	);
}

// --- Team Column ---

interface TeamColumnProps {
	teamId: string;
	index: number;
	playerIds: string[];
	getPlayer: (id: string) => PlayerInfo | undefined;
	currentPlayerId: string | null;
	currentTeamId: string | undefined;
	isHost: boolean;
	speakingPeerIds?: Set<string>;
	mutedPeerIds?: Set<string>;
	canDrag: (id: string) => boolean;
	onSwitchTeam: (teamId: string) => void;
	onKick?: (playerId: string) => void;
}

function TeamColumn({
	teamId,
	index,
	playerIds,
	getPlayer,
	currentPlayerId,
	currentTeamId,
	isHost,
	speakingPeerIds,
	mutedPeerIds,
	canDrag,
	onSwitchTeam,
	onKick,
}: TeamColumnProps) {
	const { setNodeRef, isOver } = useDroppable({ id: teamId });

	return (
		<div key={teamId} className="team-column">
			<div className="team-column-header">
				Команда {index + 1}
				{!isHost && currentTeamId !== teamId && (
					<button className="btn-small" onClick={() => onSwitchTeam(teamId)}>
						Перейти
					</button>
				)}
			</div>
			<SortableContext items={playerIds} strategy={verticalListSortingStrategy}>
				<div
					ref={setNodeRef}
					className={`team-column-players${isOver ? " team-column-players--over" : ""}`}
				>
					{playerIds.map((playerId) => {
						const player = getPlayer(playerId);
						return (
							<div key={playerId} className="team-player-row">
								<SortablePlayer
									playerId={playerId}
									player={player}
									currentPlayerId={currentPlayerId}
									disabled={!canDrag(playerId)}
									speaking={speakingPeerIds?.has(playerId)}
									muted={mutedPeerIds?.has(playerId)}
								/>
								{isHost && playerId !== currentPlayerId && onKick && (
									<button className="btn-kick" onClick={() => onKick(playerId)} title="Кикнуть">
										✕
									</button>
								)}
							</div>
						);
					})}
					{playerIds.length === 0 && <div className="team-column-empty">Перетащите сюда</div>}
				</div>
			</SortableContext>
		</div>
	);
}

// --- Sortable Player Item ---

interface SortablePlayerProps {
	playerId: string;
	player: PlayerInfo | undefined;
	currentPlayerId: string | null;
	disabled: boolean;
	speaking?: boolean;
	muted?: boolean;
}

function SortablePlayer({
	playerId,
	player,
	currentPlayerId,
	disabled,
	speaking,
	muted,
}: SortablePlayerProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: playerId,
		disabled,
	});

	const style = {
		transform: CSS.Translate.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`team-player${isDragging ? " team-player--placeholder" : ""}${!disabled ? " team-player--draggable" : ""}`}
			{...attributes}
			{...listeners}
		>
			<PlayerChip
				avatarSeed={player?.avatarSeed ?? 0}
				name={player?.name ?? playerId}
				isMe={playerId === currentPlayerId}
				isHost={player?.isHost}
				isCurrent={playerId === currentPlayerId}
				speaking={speaking}
				muted={muted}
			/>
		</div>
	);
}

// --- Unassigned Zone ---

interface UnassignedZoneProps {
	players: PlayerInfo[];
	currentPlayerId: string | null;
	isHost: boolean;
	speakingPeerIds?: Set<string>;
	mutedPeerIds?: Set<string>;
	canDrag: (id: string) => boolean;
	teamIds: string[];
	movePlayer: (playerId: string, toTeamId: string) => void;
	onSwitchTeam: (teamId: string) => void;
}

function UnassignedZone({
	players,
	currentPlayerId,
	isHost,
	speakingPeerIds,
	mutedPeerIds,
	canDrag,
	teamIds,
	movePlayer,
	onSwitchTeam,
}: UnassignedZoneProps) {
	return (
		<div className="team-unassigned">
			<div className="team-column-header">Не распределены</div>
			<SortableContext items={players.map((p) => p.id)} strategy={verticalListSortingStrategy}>
				{players.map((player) => (
					<div key={player.id} className="team-player-unassigned">
						<SortablePlayer
							playerId={player.id}
							player={player}
							currentPlayerId={currentPlayerId}
							disabled={!canDrag(player.id)}
							speaking={speakingPeerIds?.has(player.id)}
							muted={mutedPeerIds?.has(player.id)}
						/>
						{isHost ? (
							<div className="team-assign-buttons">
								{teamIds.map((tid, i) => (
									<button
										key={tid}
										className="btn-small"
										onClick={() => movePlayer(player.id, tid)}
									>
										{i + 1}
									</button>
								))}
							</div>
						) : (
							player.id === currentPlayerId && (
								<div className="team-assign-buttons">
									{teamIds.map((tid, i) => (
										<button key={tid} className="btn-small" onClick={() => onSwitchTeam(tid)}>
											{i + 1}
										</button>
									))}
								</div>
							)
						)}
					</div>
				))}
			</SortableContext>
		</div>
	);
}
