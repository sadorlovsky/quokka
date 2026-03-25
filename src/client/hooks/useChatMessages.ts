import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatBroadcastMessage } from "@/shared/types/protocol";
import { useConnection } from "../contexts/ConnectionContext";

export interface ChatEntry {
	id: number;
	playerId: string;
	playerName: string;
	text: string;
	fading: boolean;
}

let nextId = 0;

interface UseChatMessagesOptions {
	autoFade?: boolean;
}

export function useChatMessages({ autoFade = true }: UseChatMessagesOptions = {}) {
	const { send, onChatMessage, room } = useConnection();
	const [messages, setMessages] = useState<ChatEntry[]>([]);
	const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

	const scheduleRemoval = useCallback((id: number) => {
		const fadeTimer = setTimeout(() => {
			setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, fading: true } : m)));
		}, 4500);

		const removeTimer = setTimeout(() => {
			setMessages((prev) => prev.filter((m) => m.id !== id));
			timersRef.current.delete(id);
		}, 5000);

		timersRef.current.set(id, fadeTimer);
		timersRef.current.set(-id - 1, removeTimer);
	}, []);

	useEffect(() => {
		const unsub = onChatMessage((msg: ChatBroadcastMessage) => {
			const id = nextId++;
			setMessages((prev) => {
				const next = [
					...prev,
					{
						id,
						playerId: msg.playerId,
						playerName: msg.playerName,
						text: msg.text,
						fading: false,
					},
				];
				return next.length > 50 ? next.slice(-50) : next;
			});
			if (autoFade) {
				scheduleRemoval(id);
			}
		});
		return unsub;
	}, [onChatMessage, scheduleRemoval, autoFade]);

	useEffect(() => {
		const timers = timersRef.current;
		return () => {
			for (const t of timers.values()) {
				clearTimeout(t);
			}
		};
	}, []);

	const sendMessage = useCallback(
		(text: string) => {
			send({ type: "chatMessage", text });
		},
		[send],
	);

	const getPlayerColor = useCallback(
		(playerId: string): string => {
			const player = room?.players.find((p) => p.id === playerId);
			if (!player) {
				return "hsl(0, 0%, 60%)";
			}
			const hue = player.avatarSeed % 360;
			return `hsl(${hue}, 70%, 60%)`;
		},
		[room?.players],
	);

	return { messages, sendMessage, getPlayerColor };
}
