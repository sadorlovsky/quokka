import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { PauseInfo } from "@/shared/types/game";
import type {
	ChatBroadcastMessage,
	ClientMessage,
	DrawClearMessage,
	DrawHistoryMessage,
	DrawStrokeMessage,
	DrawUndoMessage,
	ServerMessage,
	VoiceMuteChangedMessage,
	VoicePeerJoinedMessage,
	VoicePeerLeftMessage,
	VoiceSignalRelayMessage,
	VoiceStateMessage,
} from "@/shared/types/protocol";
import type { RoomState } from "@/shared/types/room";
import { type ConnectionStatus, useWebSocket } from "../hooks/useWebSocket";

export type DrawingEvent =
	| DrawStrokeMessage
	| DrawClearMessage
	| DrawUndoMessage
	| DrawHistoryMessage;

export type VoiceEvent =
	| VoicePeerJoinedMessage
	| VoicePeerLeftMessage
	| VoiceSignalRelayMessage
	| VoiceMuteChangedMessage
	| VoiceStateMessage;

interface ConnectionState {
	status: ConnectionStatus;
	playerId: string | null;
	room: RoomState | null;
	gameState: unknown | null;
	pauseInfo: PauseInfo | null;
	restoring: boolean;
	lastError: { code: string; message: string } | null;
	send: (msg: ClientMessage) => void;
	connect: () => void;
	ensurePlayer: (name: string, avatarSeed: number, then: () => void) => void;
	onDrawingEvent: (listener: (event: DrawingEvent) => void) => () => void;
	onChatMessage: (listener: (msg: ChatBroadcastMessage) => void) => () => void;
	onVoiceEvent: (listener: (event: VoiceEvent) => void) => () => void;
}

const ConnectionCtx = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [room, setRoom] = useState<RoomState | null>(null);
	const [gameState, setGameState] = useState<unknown | null>(null);
	const [pauseInfo, setPauseInfo] = useState<PauseInfo | null>(null);
	const [lastError, setLastError] = useState<{ code: string; message: string } | null>(null);
	const [restoring, setRestoring] = useState(() => !!localStorage.getItem("sessionToken"));
	const pendingActionRef = useRef<(() => void) | null>(null);
	const playerIdRef = useRef<string | null>(null);

	const awaitingRoomRef = useRef(false);
	const drawingListenersRef = useRef<Set<(event: DrawingEvent) => void>>(new Set());
	const chatListenersRef = useRef<Set<(msg: ChatBroadcastMessage) => void>>(new Set());
	const voiceListenersRef = useRef<Set<(event: VoiceEvent) => void>>(new Set());

	const handleMessage = useCallback((msg: ServerMessage) => {
		switch (msg.type) {
			case "connected":
				playerIdRef.current = msg.playerId;
				setPlayerId(msg.playerId);
				if (msg.roomCode) {
					// Reconnected with a room — wait for roomState before clearing restoring
					awaitingRoomRef.current = true;
				} else {
					setRestoring(false);
				}
				break;

			case "roomCreated":
			case "roomJoined":
			case "roomState":
				setRoom(msg.room);
				if (awaitingRoomRef.current) {
					awaitingRoomRef.current = false;
					setRestoring(false);
				}
				break;

			case "playerJoined": {
				setRoom((prev) => {
					if (!prev) {
						return prev;
					}
					if (prev.players.some((p) => p.id === msg.player.id)) {
						return prev;
					}
					return { ...prev, players: [...prev.players, msg.player] };
				});
				break;
			}

			case "playerKicked": {
				if (msg.playerId === playerIdRef.current) {
					setRoom(null);
					setGameState(null);
				}
				break;
			}

			case "playerLeft": {
				if (msg.playerId === playerIdRef.current) {
					setRoom(null);
					setGameState(null);
				} else {
					setRoom((prev) => {
						if (!prev) {
							return prev;
						}
						const players = prev.players.filter((p) => p.id !== msg.playerId);
						if (players.length === 0) {
							return null;
						}
						return { ...prev, players };
					});
				}
				break;
			}

			case "playerReconnected":
			case "playerDisconnected": {
				const isConnected = msg.type === "playerReconnected";
				setRoom((prev) => {
					if (!prev) {
						return prev;
					}
					return {
						...prev,
						players: prev.players.map((p) => (p.id === msg.playerId ? { ...p, isConnected } : p)),
					};
				});
				break;
			}

			case "settingsUpdated":
				setRoom((prev) => (prev ? { ...prev, settings: msg.settings } : prev));
				break;

			case "gameStarted":
				setRoom((prev) => (prev ? { ...prev, status: "playing" } : prev));
				setGameState(msg.gameState);
				break;

			case "gameState": {
				const gameData = msg.gameState as Record<string, unknown>;
				if (gameData && typeof gameData === "object" && "validPlacements" in gameData) {
					console.log(
						`[ws] gameState received: isMyTurn=${gameData.isMyTurn}, phase=${gameData.phase}, validPlacements=${Object.keys(gameData.validPlacements as object).length}, hand=${(gameData.hand as unknown[])?.length}`,
					);
				}
				setRoom((prev) =>
					prev && prev.status === "lobby" ? { ...prev, status: "playing" } : prev,
				);
				setGameState(msg.gameState);
				break;
			}

			case "gameOver":
				setRoom((prev) => (prev ? { ...prev, status: "finished" } : prev));
				setGameState(msg.finalState);
				setPauseInfo(null);
				break;

			case "gamePaused":
				setPauseInfo(msg.pauseInfo);
				break;

			case "gameResumed":
				setPauseInfo(null);
				break;

			case "returnedToLobby":
				setRoom(msg.room);
				setGameState(null);
				setPauseInfo(null);
				break;

			case "drawStroke":
			case "drawClear":
			case "drawUndo":
			case "drawHistory":
				for (const listener of drawingListenersRef.current) {
					listener(msg);
				}
				break;

			case "chatBroadcast":
				for (const listener of chatListenersRef.current) {
					listener(msg);
				}
				break;

			case "voicePeerJoined":
			case "voicePeerLeft":
			case "voiceSignal":
			case "voiceMuteChanged":
			case "voiceState":
				for (const listener of voiceListenersRef.current) {
					listener(msg);
				}
				break;

			case "error":
				console.error(`[server error] ${msg.code}: ${msg.message}`);
				setLastError({ code: msg.code, message: msg.message });
				break;
		}
	}, []);

	const { status, send, connect } = useWebSocket({
		onMessage: handleMessage,
	});

	// Fire pending action when playerId appears
	useEffect(() => {
		if (playerId && pendingActionRef.current) {
			const action = pendingActionRef.current;
			pendingActionRef.current = null;
			action();
		}
	}, [playerId]);

	// Auto-connect WS on mount
	useEffect(() => {
		connect();
	}, [connect]);

	// Auto-reconnect: when WS connects (or reconnects), restore session from localStorage
	const prevStatusRef = useRef(status);
	useEffect(() => {
		const wasDisconnected = prevStatusRef.current !== "connected";
		prevStatusRef.current = status;

		if (status === "connected" && wasDisconnected) {
			const sessionToken = localStorage.getItem("sessionToken");
			const playerName = localStorage.getItem("playerName");
			const avatarSeed = Number(localStorage.getItem("avatarSeed")) || 0;
			if (sessionToken && playerName) {
				send({
					type: "connect",
					playerName,
					avatarSeed,
					sessionToken,
				});
			} else {
				setRestoring(false);
			}
		}
	}, [status, send]);

	const onDrawingEvent = useCallback((listener: (event: DrawingEvent) => void) => {
		drawingListenersRef.current.add(listener);
		return () => {
			drawingListenersRef.current.delete(listener);
		};
	}, []);

	const onChatMessage = useCallback((listener: (msg: ChatBroadcastMessage) => void) => {
		chatListenersRef.current.add(listener);
		return () => {
			chatListenersRef.current.delete(listener);
		};
	}, []);

	const onVoiceEvent = useCallback((listener: (event: VoiceEvent) => void) => {
		voiceListenersRef.current.add(listener);
		return () => {
			voiceListenersRef.current.delete(listener);
		};
	}, []);

	const ensurePlayer = useCallback(
		(name: string, avatarSeed: number, then: () => void) => {
			localStorage.setItem("playerName", name);
			localStorage.setItem("avatarSeed", String(avatarSeed));
			if (playerIdRef.current) {
				then();
			} else {
				pendingActionRef.current = then;
				send({ type: "connect", playerName: name, avatarSeed });
			}
		},
		[send],
	);

	const value: ConnectionState = {
		status,
		playerId,
		room,
		gameState,
		pauseInfo,
		restoring,
		lastError,
		send,
		connect,
		ensurePlayer,
		onDrawingEvent,
		onChatMessage,
		onVoiceEvent,
	};

	return <ConnectionCtx.Provider value={value}>{children}</ConnectionCtx.Provider>;
}

export function useConnection(): ConnectionState {
	const ctx = useContext(ConnectionCtx);
	if (!ctx) {
		throw new Error("useConnection must be used within ConnectionProvider");
	}
	return ctx;
}
