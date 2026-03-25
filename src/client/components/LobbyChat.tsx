import { useState } from "react";
import { useChatMessages } from "../hooks/useChatMessages";
import "./LobbyChat.css";

export function LobbyChat() {
	const { messages, sendMessage, getPlayerColor } = useChatMessages({ autoFade: true });
	const [text, setText] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = text.trim();
		if (!trimmed) {
			return;
		}
		sendMessage(trimmed);
		setText("");
	};

	return (
		<section className="lobby-chat" aria-label="Чат">
			<div className="lobby-chat-messages">
				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`lobby-chat-bubble${msg.fading ? " lobby-chat-bubble--fading" : ""}`}
					>
						<span
							className="lobby-chat-bubble-name"
							style={{ color: getPlayerColor(msg.playerId) }}
						>
							{msg.playerName}
						</span>
						<span className="lobby-chat-bubble-text">{msg.text}</span>
					</div>
				))}
			</div>
			<form className="lobby-chat-input-wrap" onSubmit={handleSubmit}>
				<input
					className="lobby-chat-input"
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="Написать в чат"
					maxLength={200}
					autoComplete="off"
				/>
			</form>
		</section>
	);
}
