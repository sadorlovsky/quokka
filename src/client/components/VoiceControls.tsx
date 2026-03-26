import { useConnection } from "../contexts/ConnectionContext";
import { useVoice } from "../contexts/VoiceContext";
import "./VoiceControls.css";

export function VoiceControls() {
	const { room } = useConnection();
	const { joined, muted, peers, join, leave, toggleMute } = useVoice();

	if (!room) {
		return null;
	}

	if (!joined) {
		return (
			<button type="button" className="voice-join-btn" onClick={join} title="Войти в голосовой чат">
				<MicIcon />
			</button>
		);
	}

	return (
		<div className="voice-controls">
			<button
				type="button"
				className={`voice-mute-btn ${muted ? "voice-mute-btn--muted" : ""}`}
				onClick={toggleMute}
				title={muted ? "Включить микрофон" : "Выключить микрофон"}
			>
				{muted ? <MicOffIcon /> : <MicIcon />}
			</button>
			<button
				type="button"
				className="voice-leave-btn"
				onClick={leave}
				title="Выйти из голосового чата"
			>
				<PhoneOffIcon />
			</button>
		</div>
	);
}

function MicIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Микрофон</title>
			<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<line x1="12" x2="12" y1="19" y2="22" />
		</svg>
	);
}

function MicOffIcon() {
	return (
		<svg
			width="18"
			height="18"
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
	);
}

function PhoneOffIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Отключиться</title>
			<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
			<line x1="22" x2="2" y1="2" y2="22" />
		</svg>
	);
}

function VoiceWaveIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Голосовой чат</title>
			<path d="M2 10v3" />
			<path d="M6 6v11" />
			<path d="M10 3v18" />
			<path d="M14 8v7" />
			<path d="M18 5v13" />
			<path d="M22 10v3" />
		</svg>
	);
}
