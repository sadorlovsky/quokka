import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, type VoiceEvent } from "../contexts/ConnectionContext";

interface VoicePeer {
	playerId: string;
	muted: boolean;
}

interface PeerConnection {
	pc: RTCPeerConnection;
	audio: HTMLAudioElement;
}

const ICE_SERVERS: RTCIceServer[] = [
	{ urls: "stun:stun.l.google.com:19302" },
	{ urls: "stun:stun1.l.google.com:19302" },
];

export function useVoiceChat() {
	const { send, onVoiceEvent } = useConnection();
	const [joined, setJoined] = useState(false);
	const [muted, setMuted] = useState(false);
	const [peers, setPeers] = useState<VoicePeer[]>([]);

	const localStreamRef = useRef<MediaStream | null>(null);
	const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
	const joinedRef = useRef(false);

	// Keep ref in sync
	joinedRef.current = joined;

	const createPeerConnection = useCallback(
		(peerId: string, isInitiator: boolean) => {
			const existing = connectionsRef.current.get(peerId);
			if (existing) {
				existing.pc.close();
				existing.audio.srcObject = null;
			}

			const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
			const audio = new Audio();
			audio.autoplay = true;

			// Add local tracks
			const stream = localStreamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) {
					pc.addTrack(track, stream);
				}
			}

			// Receive remote audio
			pc.ontrack = (e) => {
				audio.srcObject = e.streams[0] ?? null;
			};

			// Send ICE candidates
			pc.onicecandidate = (e) => {
				if (e.candidate) {
					send({
						type: "voiceSignal",
						targetPlayerId: peerId,
						signal: { type: "candidate", candidate: e.candidate.toJSON() },
					});
				}
			};

			connectionsRef.current.set(peerId, { pc, audio });

			// Initiator creates offer
			if (isInitiator) {
				pc.createOffer()
					.then((offer) => pc.setLocalDescription(offer))
					.then(() => {
						send({
							type: "voiceSignal",
							targetPlayerId: peerId,
							signal: {
								type: "offer",
								sdp: pc.localDescription?.sdp,
							},
						});
					})
					.catch(console.error);
			}

			return pc;
		},
		[send],
	);

	const handleVoiceEvent = useCallback(
		(event: VoiceEvent) => {
			switch (event.type) {
				case "voiceState": {
					// Received when we join — list of existing peers
					setPeers(event.peers);
					// Create connections to all existing peers (we are initiator)
					for (const peer of event.peers) {
						createPeerConnection(peer.playerId, true);
					}
					break;
				}

				case "voicePeerJoined": {
					setPeers((prev) => {
						if (prev.some((p) => p.playerId === event.playerId)) {
							return prev;
						}
						return [...prev, { playerId: event.playerId, muted: event.muted }];
					});
					// New peer joined — they will initiate connection to us
					break;
				}

				case "voicePeerLeft": {
					setPeers((prev) => prev.filter((p) => p.playerId !== event.playerId));
					const conn = connectionsRef.current.get(event.playerId);
					if (conn) {
						conn.pc.close();
						conn.audio.srcObject = null;
						connectionsRef.current.delete(event.playerId);
					}
					break;
				}

				case "voiceMuteChanged": {
					setPeers((prev) =>
						prev.map((p) => (p.playerId === event.playerId ? { ...p, muted: event.muted } : p)),
					);
					break;
				}

				case "voiceSignal": {
					const signal = event.signal as {
						type: string;
						sdp?: string;
						candidate?: RTCIceCandidateInit;
					};
					const fromId = event.fromPlayerId;

					if (signal.type === "offer") {
						// Create connection as answerer
						const pc = createPeerConnection(fromId, false);
						pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }))
							.then(() => pc.createAnswer())
							.then((answer) => pc.setLocalDescription(answer))
							.then(() => {
								send({
									type: "voiceSignal",
									targetPlayerId: fromId,
									signal: {
										type: "answer",
										sdp: pc.localDescription?.sdp,
									},
								});
							})
							.catch(console.error);
					} else if (signal.type === "answer") {
						const conn = connectionsRef.current.get(fromId);
						if (conn) {
							conn.pc
								.setRemoteDescription(
									new RTCSessionDescription({ type: "answer", sdp: signal.sdp }),
								)
								.catch(console.error);
						}
					} else if (signal.type === "candidate") {
						const conn = connectionsRef.current.get(fromId);
						if (conn && signal.candidate) {
							conn.pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(console.error);
						}
					}
					break;
				}
			}
		},
		[createPeerConnection, send],
	);

	// Subscribe to voice events
	useEffect(() => {
		return onVoiceEvent(handleVoiceEvent);
	}, [onVoiceEvent, handleVoiceEvent]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			for (const { pc, audio } of connectionsRef.current.values()) {
				pc.close();
				audio.srcObject = null;
			}
			connectionsRef.current.clear();

			const stream = localStreamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				localStreamRef.current = null;
			}
		};
	}, []);

	const join = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			localStreamRef.current = stream;
			setJoined(true);
			setMuted(false);
			send({ type: "voiceJoin" });
		} catch (err) {
			console.error("[voice] microphone access denied:", err);
		}
	}, [send]);

	const leave = useCallback(() => {
		// Close all peer connections
		for (const { pc, audio } of connectionsRef.current.values()) {
			pc.close();
			audio.srcObject = null;
		}
		connectionsRef.current.clear();

		// Stop microphone
		const stream = localStreamRef.current;
		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop();
			}
			localStreamRef.current = null;
		}

		setPeers([]);
		setJoined(false);
		setMuted(false);
		send({ type: "voiceLeave" });
	}, [send]);

	const toggleMute = useCallback(() => {
		const stream = localStreamRef.current;
		if (!stream) {
			return;
		}

		const newMuted = !muted;
		for (const track of stream.getAudioTracks()) {
			track.enabled = !newMuted;
		}
		setMuted(newMuted);
		send({ type: "voiceMute", muted: newMuted });
	}, [muted, send]);

	return {
		joined,
		muted,
		peers,
		join,
		leave,
		toggleMute,
	};
}
