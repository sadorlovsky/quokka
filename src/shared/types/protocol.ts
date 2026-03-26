import type { PauseInfo } from "./game";
import type { PlayerInfo, RoomSettings, RoomState } from "./room";

// --- Client → Server ---

export interface ConnectMessage {
	type: "connect";
	sessionToken?: string;
	playerName: string;
	avatarSeed: number;
}

export interface CreateRoomMessage {
	type: "createRoom";
	settings?: Partial<RoomSettings>;
}

export interface JoinRoomMessage {
	type: "joinRoom";
	roomCode: string;
}

export interface LeaveRoomMessage {
	type: "leaveRoom";
}

export interface UpdateSettingsMessage {
	type: "updateSettings";
	settings: Partial<RoomSettings>;
}

export interface StartGameMessage {
	type: "startGame";
}

export interface GameActionMessage {
	type: "gameAction";
	action: unknown;
}

export interface HeartbeatMessage {
	type: "heartbeat";
}

export interface ReturnToLobbyMessage {
	type: "returnToLobby";
}

export interface EndGameMessage {
	type: "endGame";
}

export interface SwitchTeamMessage {
	type: "switchTeam";
	teamId: string;
}

export interface KickPlayerMessage {
	type: "kickPlayer";
	targetPlayerId: string;
}

export interface DrawStrokeMessage {
	type: "drawStroke";
	points: { x: number; y: number }[];
	newStroke?: boolean;
}

export interface DrawClearMessage {
	type: "drawClear";
}

export interface DrawUndoMessage {
	type: "drawUndo";
}

export interface ChatMessage {
	type: "chatMessage";
	text: string;
}

export interface VoiceJoinMessage {
	type: "voiceJoin";
}

export interface VoiceLeaveMessage {
	type: "voiceLeave";
}

export interface VoiceSignalMessage {
	type: "voiceSignal";
	targetPlayerId: string;
	signal: unknown;
}

export interface VoiceMuteMessage {
	type: "voiceMute";
	muted: boolean;
}

export interface VoiceSpeakingMessage {
	type: "voiceSpeaking";
	speaking: boolean;
}

export type ClientMessage =
	| ConnectMessage
	| CreateRoomMessage
	| JoinRoomMessage
	| LeaveRoomMessage
	| UpdateSettingsMessage
	| StartGameMessage
	| GameActionMessage
	| HeartbeatMessage
	| ReturnToLobbyMessage
	| EndGameMessage
	| SwitchTeamMessage
	| KickPlayerMessage
	| DrawStrokeMessage
	| DrawClearMessage
	| DrawUndoMessage
	| ChatMessage
	| VoiceJoinMessage
	| VoiceLeaveMessage
	| VoiceSignalMessage
	| VoiceMuteMessage
	| VoiceSpeakingMessage;

// --- Server → Client ---

export interface ConnectedMessage {
	type: "connected";
	playerId: string;
	sessionToken: string;
	roomCode?: string;
}

export interface RoomCreatedMessage {
	type: "roomCreated";
	room: RoomState;
}

export interface RoomJoinedMessage {
	type: "roomJoined";
	room: RoomState;
}

export interface RoomStateMessage {
	type: "roomState";
	room: RoomState;
}

export interface PlayerJoinedMessage {
	type: "playerJoined";
	player: PlayerInfo;
}

export interface PlayerLeftMessage {
	type: "playerLeft";
	playerId: string;
}

export interface PlayerReconnectedMessage {
	type: "playerReconnected";
	playerId: string;
}

export interface PlayerDisconnectedMessage {
	type: "playerDisconnected";
	playerId: string;
}

export interface SettingsUpdatedMessage {
	type: "settingsUpdated";
	settings: RoomSettings;
}

export interface GameStartedMessage {
	type: "gameStarted";
	gameState: unknown;
}

export interface GameStateMessage {
	type: "gameState";
	gameState: unknown;
}

export interface GameActionResultMessage {
	type: "gameActionResult";
	success: boolean;
	error?: string;
}

export interface GameOverMessage {
	type: "gameOver";
	finalState: unknown;
}

export interface TimerSyncMessage {
	type: "timerSync";
	endsAt: number;
}

export interface ReturnedToLobbyMessage {
	type: "returnedToLobby";
	room: RoomState;
}

export interface GamePausedMessage {
	type: "gamePaused";
	pauseInfo: PauseInfo;
}

export interface GameResumedMessage {
	type: "gameResumed";
}

export interface PlayerKickedMessage {
	type: "playerKicked";
	playerId: string;
}

export interface DrawHistoryMessage {
	type: "drawHistory";
	strokes: { x: number; y: number }[][];
}

export interface ChatBroadcastMessage {
	type: "chatBroadcast";
	playerId: string;
	playerName: string;
	text: string;
	timestamp: number;
}

export interface VoicePeerJoinedMessage {
	type: "voicePeerJoined";
	playerId: string;
	muted: boolean;
}

export interface VoicePeerLeftMessage {
	type: "voicePeerLeft";
	playerId: string;
}

export interface VoiceSignalRelayMessage {
	type: "voiceSignal";
	fromPlayerId: string;
	signal: unknown;
}

export interface VoiceMuteChangedMessage {
	type: "voiceMuteChanged";
	playerId: string;
	muted: boolean;
}

export interface VoiceSpeakingChangedMessage {
	type: "voiceSpeakingChanged";
	playerId: string;
	speaking: boolean;
}

export interface VoiceStateMessage {
	type: "voiceState";
	peers: { playerId: string; muted: boolean }[];
}

export interface ErrorMessage {
	type: "error";
	code: string;
	message: string;
}

export type ServerMessage =
	| ConnectedMessage
	| RoomCreatedMessage
	| RoomJoinedMessage
	| RoomStateMessage
	| PlayerJoinedMessage
	| PlayerLeftMessage
	| PlayerReconnectedMessage
	| PlayerDisconnectedMessage
	| SettingsUpdatedMessage
	| GameStartedMessage
	| GameStateMessage
	| GameActionResultMessage
	| GameOverMessage
	| TimerSyncMessage
	| ReturnedToLobbyMessage
	| GamePausedMessage
	| GameResumedMessage
	| PlayerKickedMessage
	| DrawStrokeMessage
	| DrawClearMessage
	| DrawUndoMessage
	| DrawHistoryMessage
	| ChatBroadcastMessage
	| VoicePeerJoinedMessage
	| VoicePeerLeftMessage
	| VoiceSignalRelayMessage
	| VoiceMuteChangedMessage
	| VoiceSpeakingChangedMessage
	| VoiceStateMessage
	| ErrorMessage;
