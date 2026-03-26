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

const VAD_THRESHOLD = 0.015;
const VAD_INTERVAL_MS = 100;

const ICE_SERVERS: RTCIceServer[] = [
	{ urls: "stun:stun.l.google.com:19302" },
	{ urls: "stun:stun1.l.google.com:19302" },
];

export function useVoiceChat() {
	const { send, onVoiceEvent, playerId } = useConnection();
	const [joined, setJoined] = useState(false);
	const [muted, setMuted] = useState(false);
	const [peers, setPeers] = useState<VoicePeer[]>([]);
	const [speakingPeerIds, setSpeakingPeerIds] = useState<Set<string>>(new Set());

	const localStreamRef = useRef<MediaStream | null>(null);
	const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
	const joinedRef = useRef(false);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
	const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Keep ref in sync
	joinedRef.current = joined;

	const getAudioContext = useCallback(() => {
		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
		}
		return audioContextRef.current;
	}, []);

	const createAnalyser = useCallback(
		(id: string, stream: MediaStream) => {
			const ctx = getAudioContext();
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			analysersRef.current.set(id, analyser);
		},
		[getAudioContext],
	);

	const createPeerConnection = useCallback(
		(peerId: string, isInitiator: boolean) => {
			const existing = connectionsRef.current.get(peerId);
			if (existing) {
				existing.pc.close();
				existing.audio.srcObject = null;
			}
			analysersRef.current.delete(peerId);

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

			// Receive remote audio + set up VAD analyser
			pc.ontrack = (e) => {
				const remoteStream = e.streams[0] ?? null;
				audio.srcObject = remoteStream;
				if (remoteStream) {
					createAnalyser(peerId, remoteStream);
				}
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
		[send, createAnalyser],
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
					analysersRef.current.delete(event.playerId);
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

	// VAD polling
	useEffect(() => {
		if (!joined) {
			return;
		}

		const dataArray = new Uint8Array(128);

		vadIntervalRef.current = setInterval(() => {
			const next = new Set<string>();

			// Check local stream (self)
			const localAnalyser = analysersRef.current.get("__local__");
			if (localAnalyser && playerId) {
				localAnalyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length / 255;
				if (avg > VAD_THRESHOLD) {
					next.add(playerId);
				}
			}

			// Check remote streams
			for (const [peerId, analyser] of analysersRef.current) {
				if (peerId === "__local__") continue;
				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length / 255;
				if (avg > VAD_THRESHOLD) {
					next.add(peerId);
				}
			}

			setSpeakingPeerIds((prev) => {
				if (prev.size === next.size && [...prev].every((id) => next.has(id))) {
					return prev;
				}
				return next;
			});
		}, VAD_INTERVAL_MS);

		return () => {
			if (vadIntervalRef.current) {
				clearInterval(vadIntervalRef.current);
				vadIntervalRef.current = null;
			}
			setSpeakingPeerIds(new Set());
		};
	}, [joined, playerId]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (vadIntervalRef.current) {
				clearInterval(vadIntervalRef.current);
				vadIntervalRef.current = null;
			}
			analysersRef.current.clear();
			if (audioContextRef.current) {
				audioContextRef.current.close();
				audioContextRef.current = null;
			}

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
			createAnalyser("__local__", stream);
			setJoined(true);
			setMuted(false);
			send({ type: "voiceJoin" });
		} catch (err) {
			console.error("[voice] microphone access denied:", err);
		}
	}, [send, createAnalyser]);

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

		// Clean up VAD
		analysersRef.current.clear();
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}

		setPeers([]);
		setJoined(false);
		setMuted(false);
		setSpeakingPeerIds(new Set());
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
		speakingPeerIds,
		join,
		leave,
		toggleMute,
	};
}
