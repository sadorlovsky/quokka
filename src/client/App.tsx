import { useCallback, useEffect, useRef, useState } from "react";
import { ChatOverlay } from "./components/ChatOverlay";
import { Layout } from "./components/Layout";
import { ConnectionProvider, useConnection } from "./contexts/ConnectionContext";
import { GameScreen } from "./screens/GameScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { generateRandomName } from "./utils/random-name";
import "./styles/global.css";

function getRoomCodeFromUrl(): string | null {
	return window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)$/)?.[1]?.toUpperCase() ?? null;
}

const initialJoinCode = getRoomCodeFromUrl();
const hasExistingSession = !!localStorage.getItem("sessionToken");
console.log("[router] module init:", {
	initialJoinCode,
	hasExistingSession,
	sessionToken: localStorage.getItem("sessionToken")?.slice(0, 8),
});

function Router() {
	const { room, restoring, status, send, ensurePlayer, lastError } = useConnection();
	const [joiningViaUrl, setJoiningViaUrl] = useState(!!initialJoinCode);
	const joinAttemptedRef = useRef(false);
	// Track current path to react to URL changes (address bar, popstate)
	const [path, setPath] = useState(window.location.pathname);

	const isConnected = status === "connected";

	// Listen for popstate (back/forward) and manual URL changes
	useEffect(() => {
		const onPopState = () => setPath(window.location.pathname);
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	// Navigate helper: pushState + update path state
	const navigate = useCallback((target: string) => {
		if (window.location.pathname !== target) {
			history.pushState(null, "", target);
			setPath(target);
		}
	}, []);

	// Auto-join for NEW users arriving via /room/CODE link
	useEffect(() => {
		console.log("[router] new-user effect:", {
			initialJoinCode,
			hasExistingSession,
			joinAttempted: joinAttemptedRef.current,
			isConnected,
		});
		if (!initialJoinCode || hasExistingSession || joinAttemptedRef.current) {
			return;
		}
		if (!isConnected) {
			return;
		}
		joinAttemptedRef.current = true;
		const name = localStorage.getItem("playerName") || generateRandomName();
		const avatarSeed = Number(localStorage.getItem("avatarSeed")) || 0;
		console.log("[router] new-user: calling ensurePlayer + joinRoom", initialJoinCode);
		ensurePlayer(name, avatarSeed, () => {
			send({ type: "joinRoom", roomCode: initialJoinCode });
		});
	}, [isConnected, ensurePlayer, send]);

	// Auto-join for EXISTING users: after session restores, if not in a room, join via URL
	// Also mark as attempted if reconnect already restored the room (so we don't re-join on leave)
	useEffect(() => {
		console.log("[router] existing-user effect:", {
			initialJoinCode,
			hasExistingSession,
			joinAttempted: joinAttemptedRef.current,
			restoring,
			hasRoom: !!room,
			isConnected,
		});
		if (!initialJoinCode || !hasExistingSession || joinAttemptedRef.current) {
			return;
		}
		if (restoring) {
			return;
		}
		if (room) {
			// Reconnect already restored us into a room — no auto-join needed
			console.log("[router] existing-user: room already restored, skipping");
			joinAttemptedRef.current = true;
			return;
		}
		if (!isConnected) {
			return;
		}
		joinAttemptedRef.current = true;
		console.log("[router] existing-user: sending joinRoom", initialJoinCode);
		send({ type: "joinRoom", roomCode: initialJoinCode });
	}, [isConnected, restoring, room, send]);

	// Clear joiningViaUrl once room is set (success), on error (failure), or after timeout
	useEffect(() => {
		if (!joiningViaUrl) {
			return;
		}
		if (room) {
			setJoiningViaUrl(false);
			return;
		}
		if (lastError) {
			console.log("[router] joiningViaUrl: got error, redirecting home", lastError);
			setJoiningViaUrl(false);
			navigate("/");
			return;
		}
		if (!restoring && joinAttemptedRef.current === false && !initialJoinCode) {
			setJoiningViaUrl(false);
			return;
		}
		const timeout = setTimeout(() => {
			console.log("[router] joiningViaUrl: timeout, redirecting home");
			setJoiningViaUrl(false);
			navigate("/");
		}, 5000);
		return () => clearTimeout(timeout);
	}, [joiningViaUrl, room, restoring, lastError, navigate]);

	// Navigate to /room/CODE when user explicitly joins/creates a room,
	// and to / when room disappears (left/kicked).
	// Does NOT navigate on reconnect — preserves the URL user arrived on.
	const prevRoomCodeRef = useRef<string | null>(room?.code ?? initialJoinCode ?? null);
	const restoredRef = useRef(restoring);
	useEffect(() => {
		if (restoring || joiningViaUrl) {
			return;
		}
		// After restoring completes (reconnect), sync prevRef but don't auto-navigate
		// Exception: if URL has a mismatched room code, fix it
		if (restoredRef.current) {
			restoredRef.current = false;
			prevRoomCodeRef.current = room?.code ?? null;
			const urlCode = getRoomCodeFromUrl();
			if (urlCode && room && urlCode !== room.code) {
				// URL points to a different room than the one we're in — go home
				navigate("/");
			}
			return;
		}
		const prevCode = prevRoomCodeRef.current;
		const newCode = room?.code ?? null;
		prevRoomCodeRef.current = newCode;

		if (newCode && !prevCode) {
			navigate(`/room/${newCode}`);
		} else if (!newCode && prevCode) {
			navigate("/");
		}
	}, [room?.code, restoring, joiningViaUrl, room, navigate]);

	// Determine which screen to show based on URL path + room state
	const urlRoomCode = path.match(/^\/room\/([A-Za-z0-9]+)$/)?.[1]?.toUpperCase() ?? null;

	if (restoring) {
		return null;
	}
	if (!room && joiningViaUrl) {
		return null;
	}

	// Show home if: no room, on /, or URL room code doesn't match active room
	if (!room || !urlRoomCode || urlRoomCode !== room.code) {
		return <HomeScreen />;
	}
	if (room.status === "playing" || room.status === "finished") {
		return (
			<>
				<GameScreen />
				<ChatOverlay />
			</>
		);
	}
	return <LobbyScreen />;
}

export function App() {
	return (
		<ConnectionProvider>
			<Layout>
				<Router />
			</Layout>
		</ConnectionProvider>
	);
}

export default App;
