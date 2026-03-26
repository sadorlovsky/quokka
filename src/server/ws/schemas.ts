import { Either, Schema } from "effect";
import type { ClientMessage } from "@/shared/types/protocol";

// Reusable field schemas
const PlayerName = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(20));
const AvatarSeed = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const RoomCode = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(10));
const PlayerId = Schema.String.pipe(Schema.minLength(1));
const TeamId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50));

// Client → Server message schemas

const ConnectMessage = Schema.Struct({
	type: Schema.Literal("connect"),
	playerName: PlayerName,
	avatarSeed: AvatarSeed,
	sessionToken: Schema.optional(Schema.String),
});

const HeartbeatMessage = Schema.Struct({
	type: Schema.Literal("heartbeat"),
});

const CreateRoomMessage = Schema.Struct({
	type: Schema.Literal("createRoom"),
	settings: Schema.optional(
		Schema.Struct({
			gameId: Schema.optional(Schema.String),
			maxPlayers: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(2))),
			gameConfig: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
		}),
	),
});

const JoinRoomMessage = Schema.Struct({
	type: Schema.Literal("joinRoom"),
	roomCode: RoomCode,
});

const LeaveRoomMessage = Schema.Struct({
	type: Schema.Literal("leaveRoom"),
});

const UpdateSettingsMessage = Schema.Struct({
	type: Schema.Literal("updateSettings"),
	settings: Schema.Struct({
		gameId: Schema.optional(Schema.String),
		maxPlayers: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(2))),
		gameConfig: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
	}),
});

const StartGameMessage = Schema.Struct({
	type: Schema.Literal("startGame"),
});

const DefinedValue = Schema.Unknown.pipe(
	Schema.filter((v) => v !== undefined, { message: () => "action is required" }),
);

const GameActionMessage = Schema.Struct({
	type: Schema.Literal("gameAction"),
	action: DefinedValue,
});

const ReturnToLobbyMessage = Schema.Struct({
	type: Schema.Literal("returnToLobby"),
});

const EndGameMessage = Schema.Struct({
	type: Schema.Literal("endGame"),
});

const SwitchTeamMessage = Schema.Struct({
	type: Schema.Literal("switchTeam"),
	teamId: TeamId,
});

const KickPlayerMessage = Schema.Struct({
	type: Schema.Literal("kickPlayer"),
	targetPlayerId: PlayerId,
});

const DrawPoint = Schema.Struct({
	x: Schema.Number,
	y: Schema.Number,
});

const DrawStrokeMessage = Schema.Struct({
	type: Schema.Literal("drawStroke"),
	points: Schema.Array(DrawPoint),
	newStroke: Schema.optional(Schema.Boolean),
});

const DrawClearMessage = Schema.Struct({
	type: Schema.Literal("drawClear"),
});

const DrawUndoMessage = Schema.Struct({
	type: Schema.Literal("drawUndo"),
});

const ChatMessageSchema = Schema.Struct({
	type: Schema.Literal("chatMessage"),
	text: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
});

const VoiceJoinMessage = Schema.Struct({
	type: Schema.Literal("voiceJoin"),
});

const VoiceLeaveMessage = Schema.Struct({
	type: Schema.Literal("voiceLeave"),
});

const VoiceSignalMessage = Schema.Struct({
	type: Schema.Literal("voiceSignal"),
	targetPlayerId: PlayerId,
	signal: Schema.Unknown,
});

const VoiceMuteMessage = Schema.Struct({
	type: Schema.Literal("voiceMute"),
	muted: Schema.Boolean,
});

const VoiceSpeakingMessage = Schema.Struct({
	type: Schema.Literal("voiceSpeaking"),
	speaking: Schema.Boolean,
});

const ClientMessageSchema = Schema.Union(
	ConnectMessage,
	HeartbeatMessage,
	CreateRoomMessage,
	JoinRoomMessage,
	LeaveRoomMessage,
	UpdateSettingsMessage,
	StartGameMessage,
	GameActionMessage,
	ReturnToLobbyMessage,
	EndGameMessage,
	SwitchTeamMessage,
	KickPlayerMessage,
	DrawStrokeMessage,
	DrawClearMessage,
	DrawUndoMessage,
	ChatMessageSchema,
	VoiceJoinMessage,
	VoiceLeaveMessage,
	VoiceSignalMessage,
	VoiceMuteMessage,
	VoiceSpeakingMessage,
);

const decode = Schema.decodeUnknownEither(ClientMessageSchema);

export function decodeClientMessage(json: unknown): ClientMessage | null {
	const result = decode(json);
	if (Either.isRight(result)) {
		return result.right as ClientMessage;
	}
	return null;
}
