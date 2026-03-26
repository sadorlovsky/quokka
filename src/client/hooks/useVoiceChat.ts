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

/**
 * Patch SDP to force high-quality Opus parameters:
 * - maxaveragebitrate=128000 (128 kbps instead of default ~32)
 * - maxplaybackrate=48000 (full bandwidth, not narrowband)
 * - useinbandfec=1 (Forward Error Correction — recover lost packets)
 * - usedtx=0 (disable Discontinuous Transmission — no silence clipping)
 * - cbr=1 (Constant Bitrate — less quality "pulsation")
 * - stereo=0, sprop-stereo=0 (mono — save bandwidth for voice)
 * - ptime=20 (20ms frames — good balance of latency vs efficiency)
 */
function patchOpusSdp(sdp: string): string {
	let patched = sdp.replace(
		/(a=fmtp:\d+ [^\r\n]+)/g,
		"$1;maxaveragebitrate=128000;maxplaybackrate=48000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=0;cbr=1",
	);
	// Set ptime=20 (20ms audio frames)
	patched = patched.replace(/(a=rtpmap:\d+ opus\/48000\/2)/g, "$1\r\na=ptime:20");
	return patched;
}

export function useVoiceChat() {
	const { send, onVoiceEvent, playerId } = useConnection();
	const [joined, setJoined] = useState(false);
	const [muted, setMuted] = useState(false);
	const [peers, setPeers] = useState<VoicePeer[]>([]);
	const [speakingPeerIds, setSpeakingPeerIds] = useState<Set<string>>(new Set());
	const [serverSpeakingPeerIds, setServerSpeakingPeerIds] = useState<Set<string>>(new Set());

	const localStreamRef = useRef<MediaStream | null>(null);
	const processedStreamRef = useRef<MediaStream | null>(null);
	const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
	const joinedRef = useRef(false);
	const audioContextRef = useRef<AudioContext | null>(null);
	const localSpeakingRef = useRef(false);

	// Remote peer VAD (simple analyser-based — remote audio is already noise-suppressed)
	const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
	const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Silero VAD + RNNoise refs
	const vadInstanceRef = useRef<{
		pause: () => Promise<void>;
		destroy: () => Promise<void>;
	} | null>(null);
	const rnnoiseNodeRef = useRef<{ destroy: () => void } | null>(null);

	// Keep ref in sync
	joinedRef.current = joined;

	const getAudioContext = useCallback(() => {
		if (!audioContextRef.current || audioContextRef.current.state === "closed") {
			audioContextRef.current = new AudioContext({ sampleRate: 48000 });
		}
		return audioContextRef.current;
	}, []);

	const createRemoteAnalyser = useCallback(
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

			// Add local tracks — use processed (noise-suppressed) stream if available
			const stream = processedStreamRef.current ?? localStreamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) {
					pc.addTrack(track, stream);
				}
			}

			// Force high bitrate via setParameters (belt-and-suspenders with SDP patching)
			const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
			if (audioSender) {
				const params = audioSender.getParameters();
				if (params.encodings.length === 0) {
					params.encodings = [{}];
				}
				params.encodings[0].maxBitrate = 128_000;
				params.encodings[0].networkPriority = "high" as RTCPriorityType;
				params.encodings[0].priority = "high" as RTCPriorityType;
				audioSender.setParameters(params).catch(console.warn);
			}

			// Receive remote audio + set up VAD analyser for remote peers
			pc.ontrack = (e) => {
				const remoteStream = e.streams[0] ?? null;
				audio.srcObject = remoteStream;
				if (remoteStream) {
					createRemoteAnalyser(peerId, remoteStream);
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
					.then((offer) => {
						offer.sdp = patchOpusSdp(offer.sdp ?? "");
						return pc.setLocalDescription(offer);
					})
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
		[send, createRemoteAnalyser],
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
					setServerSpeakingPeerIds((prev) => {
						if (!prev.has(event.playerId)) return prev;
						const next = new Set(prev);
						next.delete(event.playerId);
						return next;
					});
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

				case "voiceSpeakingChanged": {
					setServerSpeakingPeerIds((prev) => {
						if (event.speaking) {
							if (prev.has(event.playerId)) return prev;
							const next = new Set(prev);
							next.add(event.playerId);
							return next;
						}
						if (!prev.has(event.playerId)) return prev;
						const next = new Set(prev);
						next.delete(event.playerId);
						return next;
					});
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
							.then((answer) => {
								answer.sdp = patchOpusSdp(answer.sdp ?? "");
								return pc.setLocalDescription(answer);
							})
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

	// Remote peer VAD polling (simple threshold — remote audio is already noise-suppressed by sender)
	useEffect(() => {
		if (!joined) {
			return;
		}

		const dataArray = new Uint8Array(128);

		vadIntervalRef.current = setInterval(() => {
			const remoteSpeaking = new Set<string>();

			for (const [peerId, analyser] of analysersRef.current) {
				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length / 255;
				if (avg > VAD_THRESHOLD) {
					remoteSpeaking.add(peerId);
				}
			}

			setSpeakingPeerIds((prev) => {
				// Merge remote speaking with local speaking state
				const next = new Set(remoteSpeaking);
				if (playerId && localSpeakingRef.current) {
					next.add(playerId);
				}
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

			vadInstanceRef.current?.destroy();
			vadInstanceRef.current = null;

			rnnoiseNodeRef.current?.destroy();
			rnnoiseNodeRef.current = null;

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
			processedStreamRef.current = null;
		};
	}, []);

	const join = useCallback(async () => {
		try {
			const rawStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					sampleRate: 48000,
					channelCount: 1,
					latency: { ideal: 0.01 },
					echoCancellation: true,
					noiseSuppression: false, // Disabled — RNNoise handles this
					autoGainControl: true,
				},
			});
			localStreamRef.current = rawStream;

			const ctx = getAudioContext();

			// Set up RNNoise noise suppression pipeline
			try {
				const { RnnoiseWorkletNode, loadRnnoise } = await import(
					"@sapphi-red/web-noise-suppressor"
				);

				const wasmBinary = await loadRnnoise({
					url: "/rnnoise/rnnoise.wasm",
					simdUrl: "/rnnoise/rnnoise_simd.wasm",
				});

				await ctx.audioWorklet.addModule("/rnnoise/workletProcessor.js");

				const rnnoiseNode = new RnnoiseWorkletNode(ctx, {
					maxChannels: 1,
					wasmBinary,
				});
				rnnoiseNodeRef.current = rnnoiseNode;

				const source = ctx.createMediaStreamSource(rawStream);
				const destination = ctx.createMediaStreamDestination();
				source.connect(rnnoiseNode);
				rnnoiseNode.connect(destination);

				processedStreamRef.current = destination.stream;
				console.log("[voice] RNNoise noise suppression enabled");
			} catch (err) {
				console.warn("[voice] RNNoise setup failed, using raw audio:", err);
				processedStreamRef.current = rawStream;
			}

			// Set up Silero VAD for local speech detection
			try {
				const { MicVAD } = await import("@ricky0123/vad-web");

				const currentPlayerId = playerId;
				const currentSend = send;

				const vad = await MicVAD.new({
					getStream: () => Promise.resolve(rawStream),
					positiveSpeechThreshold: 0.8,
					negativeSpeechThreshold: 0.3,
					minSpeechFrames: 3,
					redemptionFrames: 8,
					startOnLoad: false,
					baseAssetPath: "/vad/",
					onnxWASMBasePath: "/vad/",
					onSpeechStart: () => {
						if (currentPlayerId) {
							localSpeakingRef.current = true;
							setSpeakingPeerIds((prev) => {
								if (prev.has(currentPlayerId)) return prev;
								const next = new Set(prev);
								next.add(currentPlayerId);
								return next;
							});
							currentSend({ type: "voiceSpeaking", speaking: true });
						}
					},
					onSpeechEnd: (_audio: Float32Array) => {
						if (currentPlayerId) {
							localSpeakingRef.current = false;
							setSpeakingPeerIds((prev) => {
								if (!prev.has(currentPlayerId)) return prev;
								const next = new Set(prev);
								next.delete(currentPlayerId);
								return next;
							});
							currentSend({ type: "voiceSpeaking", speaking: false });
						}
					},
				});

				vad.start();
				vadInstanceRef.current = vad;
				console.log("[voice] Silero VAD speech detection enabled");
			} catch (err) {
				console.warn("[voice] Silero VAD setup failed, no local speech detection:", err);
			}

			setJoined(true);
			setMuted(false);
			send({ type: "voiceJoin" });
		} catch (err) {
			console.error("[voice] microphone access denied:", err);
		}
	}, [send, getAudioContext, playerId]);

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
		processedStreamRef.current = null;

		// Clean up Silero VAD
		vadInstanceRef.current?.destroy();
		vadInstanceRef.current = null;

		// Clean up RNNoise
		rnnoiseNodeRef.current?.destroy();
		rnnoiseNodeRef.current = null;

		// Clean up remote analysers
		analysersRef.current.clear();
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}

		setPeers([]);
		setJoined(false);
		setMuted(false);
		setSpeakingPeerIds(new Set());
		localSpeakingRef.current = false;
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

		// Pause/resume Silero VAD
		if (newMuted) {
			vadInstanceRef.current?.pause();
			// Clear local speaking state when muting
			if (playerId) {
				localSpeakingRef.current = false;
				setSpeakingPeerIds((prev) => {
					if (!prev.has(playerId)) return prev;
					const next = new Set(prev);
					next.delete(playerId);
					return next;
				});
				send({ type: "voiceSpeaking", speaking: false });
			}
		} else {
			vadInstanceRef.current?.start();
		}

		setMuted(newMuted);
		send({ type: "voiceMute", muted: newMuted });
	}, [muted, send, playerId]);

	return {
		joined,
		muted,
		peers,
		speakingPeerIds,
		serverSpeakingPeerIds,
		join,
		leave,
		toggleMute,
	};
}
