import { type FormEvent, useMemo, useState } from "react";
import { GAME_META } from "@/shared/games";
import { Avatar } from "../components/Avatar";
import { useConnection } from "../contexts/ConnectionContext";
import { generateRandomName } from "../utils/random-name";
import "./HomeScreen.css";

function getOrCreateAvatarSeed(): number {
	const stored = localStorage.getItem("avatarSeed");
	if (stored) {
		return Number(stored);
	}
	const seed = Math.floor(Math.random() * 360);
	localStorage.setItem("avatarSeed", String(seed));
	return seed;
}

function getOrCreatePlayerName(): string {
	const stored = localStorage.getItem("playerName");
	if (stored) {
		return stored;
	}
	const name = generateRandomName();
	localStorage.setItem("playerName", name);
	return name;
}

export function HomeScreen() {
	const { send, status, ensurePlayer } = useConnection();
	const [playerName, setPlayerName] = useState(getOrCreatePlayerName);
	const [avatarSeed] = useState(getOrCreateAvatarSeed);
	const [selectedGame, setSelectedGame] = useState(
		() => localStorage.getItem("selectedGame") ?? "word-guess",
	);
	const [roomCode, setRoomCode] = useState("");
	const [mode, setMode] = useState<"menu" | "join">("menu");

	const isConnected = status === "connected";
	const selectedMeta = GAME_META[selectedGame];

	const games = useMemo(() => Object.entries(GAME_META), []);

	const handleCreate = () => {
		const name = playerName.trim() || generateRandomName();
		ensurePlayer(name, avatarSeed, () => {
			send({ type: "createRoom", settings: { gameId: selectedGame } });
		});
	};

	const handleJoin = (e: FormEvent) => {
		e.preventDefault();
		const code = roomCode.trim().toUpperCase();
		if (!code) {
			return;
		}
		const name = playerName.trim() || generateRandomName();
		ensurePlayer(name, avatarSeed, () => {
			send({ type: "joinRoom", roomCode: code });
		});
	};

	return (
		<div className="screen home-screen">
			<div className="home-brand">
				<div className="home-brand-row">
					<img src="/quokka.svg" alt="" className="home-mascot" aria-hidden="true" />
					<h1 className="home-title">Квокка</h1>
				</div>
				<p className="home-subtitle">вечерние игры с друзьями</p>
			</div>

			{mode === "menu" && (
				<>
					<div className="home-columns">
						{/* Left column: Player identity */}
						<section className="home-col-player" aria-label="Настройки игрока">
							<div className="player-identity">
								<Avatar seed={avatarSeed} />
								<div className="player-identity-input">
									<span className="player-identity-prefix">Игрок</span>
									<input
										type="text"
										className="input"
										value={playerName}
										onChange={(e) => setPlayerName(e.target.value)}
										maxLength={20}
										data-1p-ignore
										autoComplete="off"
										aria-label="Имя игрока"
									/>
								</div>
							</div>
							<p className="player-identity-hint">Никнейм можно изменить в любой момент</p>
						</section>

						{/* Center column: Game selector */}
						<section className="home-col-games" aria-label="Выбор игры">
							<div className="game-grid">
								{games.map(([id, meta]) => {
									const isSelected = id === selectedGame;
									return (
										<button
											key={id}
											type="button"
											className={`game-tile ${isSelected ? "game-tile--selected" : ""}`}
											aria-pressed={isSelected}
											aria-label={meta.name}
											onClick={() => {
												setSelectedGame(id);
												localStorage.setItem("selectedGame", id);
											}}
										>
											<span className="game-tile-emoji" aria-hidden="true">
												{meta.emoji}
											</span>
											<span className="game-tile-name">{meta.name}</span>
											{meta.players && <span className="game-tile-players">{meta.players}</span>}
										</button>
									);
								})}
							</div>
						</section>

						{/* Right column: Game description (desktop sidebar) */}
						{selectedMeta && (
							<aside className="home-col-detail" aria-label="Описание игры">
								<div className="game-detail">
									<span className="game-detail-emoji" aria-hidden="true">
										{selectedMeta.emoji}
									</span>
									<h2 className="game-detail-name">{selectedMeta.name}</h2>
									{selectedMeta.players && (
										<span className="game-detail-players">{selectedMeta.players} игроков</span>
									)}
									{selectedMeta.description && (
										<p className="game-detail-desc">{selectedMeta.description}</p>
									)}
								</div>
							</aside>
						)}
					</div>

					{/* Mobile-only inline description */}
					{selectedMeta?.description && (
						<div className="game-desc-mobile">
							<p className="game-desc-mobile-text">{selectedMeta.description}</p>
						</div>
					)}

					{/* Actions pinned to bottom */}
					<div className="home-actions">
						<button
							type="button"
							className="btn btn-primary"
							disabled={!isConnected}
							onClick={handleCreate}
						>
							Создать комнату
						</button>
						<span className="home-divider">или</span>
						<button
							type="button"
							className="btn btn-secondary"
							disabled={!isConnected}
							onClick={() => setMode("join")}
						>
							Присоединиться
						</button>
					</div>
				</>
			)}

			{mode === "join" && (
				<div className="join-card">
					<div className="join-card-header">
						<h2 className="join-card-title">Присоединиться</h2>
						<p className="join-card-hint">Введите код комнаты, который дал вам хост</p>
					</div>
					<form className="form" onSubmit={handleJoin}>
						<input
							type="text"
							className="input input-code"
							placeholder="ABCDEF"
							value={roomCode}
							onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
							maxLength={6}
							aria-label="Код комнаты"
						/>
						<button
							type="submit"
							className="btn btn-primary"
							disabled={!isConnected || !roomCode.trim()}
						>
							Войти
						</button>
					</form>
					<button
						type="button"
						className="join-card-back"
						onClick={() => {
							setMode("menu");
							setRoomCode("");
							history.replaceState(null, "", "/");
						}}
					>
						← Назад
					</button>
				</div>
			)}
		</div>
	);
}
