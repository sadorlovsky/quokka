import { useEffect, useRef, useState } from "react";
import { useChatMessages } from "../hooks/useChatMessages";
import "./ChatOverlay.css";

export function ChatOverlay() {
	const { messages, sendMessage, getPlayerColor } = useChatMessages({ autoFade: true });
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input when opened
	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
		}
	}, [open]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = text.trim();
		if (!trimmed) {
			return;
		}
		sendMessage(trimmed);
		setText("");
	};

	const handleBlur = () => {
		if (!text.trim()) {
			setOpen(false);
		}
	};

	return (
		<div className="chat-overlay">
			<div className="chat-messages">
				{messages.map((msg) => (
					<div key={msg.id} className={`chat-bubble${msg.fading ? " chat-bubble--fading" : ""}`}>
						<span className="chat-bubble-name" style={{ color: getPlayerColor(msg.playerId) }}>
							{msg.playerName}
						</span>
						<span className="chat-bubble-text">{msg.text}</span>
					</div>
				))}
			</div>
			{open ? (
				<form className="chat-input-wrap" onSubmit={handleSubmit}>
					<input
						ref={inputRef}
						className="input"
						type="text"
						value={text}
						onChange={(e) => setText(e.target.value)}
						onBlur={handleBlur}
						placeholder="Написать в чат"
						maxLength={200}
						autoComplete="off"
					/>
				</form>
			) : (
				<button type="button" className="chat-toggle" onClick={() => setOpen(true)}>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Чат</title>
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
					</svg>
				</button>
			)}
		</div>
	);
}
