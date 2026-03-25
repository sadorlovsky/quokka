import { type ReactNode, useCallback, useEffect } from "react";
import "./GameSettings.css";
import { getRecommendedSettings } from "@/shared/game-settings";
import type { CrocodileConfig } from "@/shared/types/crocodile";
import { DEFAULT_CROCODILE_CONFIG } from "@/shared/types/crocodile";
import type { MafiaConfig } from "@/shared/types/mafia";
import { DEFAULT_MAFIA_CONFIG } from "@/shared/types/mafia";
import type { PerudoConfig } from "@/shared/types/perudo";
import { DEFAULT_PERUDO_CONFIG } from "@/shared/types/perudo";

import type { RoomSettings } from "@/shared/types/room";
import type { WordGuessConfig } from "@/shared/types/word-guess";
import { DEFAULT_WORD_GUESS_CONFIG } from "@/shared/types/word-guess";
import { plural } from "../utils/plural";

const DIFFICULTY_LABELS: Record<string, string> = {
	all: "Любые",
	"1": "Лёгкие",
	"2": "Средние",
	"3": "Сложные",
};

interface GameSettingsProps {
	settings: RoomSettings;
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	children?: ReactNode;
}

function TapewormSettings({ children }: { children?: ReactNode }) {
	return (
		<div className="game-settings">
			<p className="settings-summary">2–4 игрока · выкладывайте сегменты червей на поле</p>
			{children}
		</div>
	);
}

function WordGuessSettings({
	isHost,
	playerCount,
	onUpdate,
	gameConfig,
	children,
}: {
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	gameConfig: Record<string, unknown> | undefined;
	children?: ReactNode;
}) {
	const config = {
		...DEFAULT_WORD_GUESS_CONFIG,
		...gameConfig,
	} as WordGuessConfig;

	const updateConfig = useCallback(
		(patch: Partial<WordGuessConfig>) => {
			onUpdate({
				gameConfig: { ...config, ...patch },
			});
		},
		[onUpdate, config],
	);

	useEffect(() => {
		if (isHost && config.mode === "teams" && playerCount < 4) {
			updateConfig({ mode: "ffa" });
		}
	}, [playerCount, config.mode, isHost, updateConfig]);

	const recommended = getRecommendedSettings(playerCount, config.difficulty);
	const totalRounds = recommended.cycles * playerCount;
	const totalMinutes = Math.round((totalRounds * recommended.roundTimeSeconds) / 60);

	if (!isHost) {
		return (
			<div className="game-settings">
				<p className="settings-summary">
					Режим: {config.mode === "ffa" ? "Каждый за себя" : "Команды"} · Слова:{" "}
					{DIFFICULTY_LABELS[String(config.difficulty)]}
					{config.textMode ? " · Ответ: Текстом" : " · Ответ: Голосом"}
				</p>
				<p className="settings-summary">
					{plural(recommended.roundTimeSeconds, "секунда", "секунды", "секунд")} на раунд ·{" "}
					{plural(totalRounds, "раунд", "раунда", "раундов")} · ~
					{plural(totalMinutes, "минута", "минуты", "минут")}
				</p>
				{children}
			</div>
		);
	}

	return (
		<div className="game-settings">
			<h3 className="settings-title">Настройки игры</h3>

			<div className="settings-group">
				<span className="settings-label">Режим</span>
				<div className="settings-options">
					<button
						className={`settings-option${config.mode === "ffa" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "ffa" })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
							<circle cx="12" cy="7" r="4" />
						</svg>
						Каждый за себя
					</button>
					<button
						className={`settings-option${config.mode === "teams" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "teams" })}
						disabled={playerCount < 4}
						title={playerCount < 4 ? "Нужно минимум 4 игрока" : undefined}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
						Команды
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Сложность слов</span>
				<div className="settings-options">
					{(
						[
							{
								value: "all" as const,
								label: "Любые",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M16 3h5v5" />
										<path d="M8 3H3v5" />
										<path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
										<path d="m15 9 6-6" />
									</svg>
								),
							},
							{
								value: 1 as const,
								label: "Лёгкие",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
									</svg>
								),
							},
							{
								value: 2 as const,
								label: "Средние",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
										<line x1="2" y1="2" x2="22" y2="22" />
									</svg>
								),
							},
							{
								value: 3 as const,
								label: "Сложные",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
										<path d="M20 3v4" />
										<path d="M22 5h-4" />
									</svg>
								),
							},
						] as const
					).map(({ value, label, icon }) => (
						<button
							key={String(value)}
							className={`settings-option${config.difficulty === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ difficulty: value })}
						>
							{icon}
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Ответ</span>
				<div className="settings-options">
					<button
						className={`settings-option${!config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
							<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
							<line x1="12" y1="19" x2="12" y2="22" />
						</svg>
						Голосом
					</button>
					<button
						className={`settings-option${config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect width="20" height="16" x="2" y="4" rx="2" />
							<path d="M6 8h.001" />
							<path d="M10 8h.001" />
							<path d="M14 8h.001" />
							<path d="M18 8h.001" />
							<path d="M8 12h.001" />
							<path d="M12 12h.001" />
							<path d="M16 12h.001" />
							<path d="M7 16h10" />
						</svg>
						Текстом
					</button>
				</div>
			</div>

			<p className="settings-summary">
				{plural(recommended.roundTimeSeconds, "секунда", "секунды", "секунд")} на раунд ·{" "}
				{plural(totalRounds, "раунд", "раунда", "раундов")} · ~
				{plural(totalMinutes, "минута", "минуты", "минут")}
			</p>

			{children}
		</div>
	);
}

function CrocodileSettings({
	isHost,
	playerCount,
	onUpdate,
	gameConfig,
	children,
}: {
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	gameConfig: Record<string, unknown> | undefined;
	children?: ReactNode;
}) {
	const config = {
		...DEFAULT_CROCODILE_CONFIG,
		...gameConfig,
	} as CrocodileConfig;

	const updateConfig = useCallback(
		(patch: Partial<CrocodileConfig>) => {
			onUpdate({
				gameConfig: { ...config, ...patch },
			});
		},
		[onUpdate, config],
	);

	const cycles = Math.max(1, Math.min(5, Math.round(8 / playerCount)));
	const totalRounds = cycles * playerCount;
	const totalMinutes = Math.round((totalRounds * config.roundTimeSeconds) / 60);

	// Auto-apply recommended cycles
	useEffect(() => {
		if (isHost && config.cycles !== cycles) {
			updateConfig({ cycles });
		}
	}, [isHost, config.cycles, cycles, updateConfig]);

	if (!isHost) {
		return (
			<div className="game-settings">
				<p className="settings-summary">
					Режим: {config.mode === "gestures" ? "Жесты" : "Рисование"} · Слова:{" "}
					{DIFFICULTY_LABELS[String(config.difficulty)]}
					{config.textMode ? " · Ответ: Текстом" : " · Ответ: Голосом"}
				</p>
				<p className="settings-summary">
					{plural(config.roundTimeSeconds, "секунда", "секунды", "секунд")} на раунд ·{" "}
					{plural(totalRounds, "раунд", "раунда", "раундов")} · ~
					{plural(totalMinutes, "минута", "минуты", "минут")}
				</p>
				{children}
			</div>
		);
	}

	return (
		<div className="game-settings">
			<h3 className="settings-title">Настройки игры</h3>

			<div className="settings-group">
				<span className="settings-label">Режим</span>
				<div className="settings-options">
					<button
						className={`settings-option${config.mode === "gestures" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "gestures", roundTimeSeconds: 60 })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
							<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
							<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
							<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
						</svg>
						Жесты
					</button>
					<button
						className={`settings-option${config.mode === "drawing" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "drawing", roundTimeSeconds: 120 })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
							<path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
						</svg>
						Рисование
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Сложность слов</span>
				<div className="settings-options">
					{(
						[
							{
								value: "all" as const,
								label: "Любые",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M16 3h5v5" />
										<path d="M8 3H3v5" />
										<path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
										<path d="m15 9 6-6" />
									</svg>
								),
							},
							{
								value: 1 as const,
								label: "Лёгкие",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
									</svg>
								),
							},
							{
								value: 2 as const,
								label: "Средние",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
										<line x1="2" y1="2" x2="22" y2="22" />
									</svg>
								),
							},
							{
								value: 3 as const,
								label: "Сложные",
								icon: (
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
										<path d="M20 3v4" />
										<path d="M22 5h-4" />
									</svg>
								),
							},
						] as const
					).map(({ value, label, icon }) => (
						<button
							key={String(value)}
							className={`settings-option${config.difficulty === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ difficulty: value })}
						>
							{icon}
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Ответ</span>
				<div className="settings-options">
					<button
						className={`settings-option${!config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
							<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
							<line x1="12" y1="19" x2="12" y2="22" />
						</svg>
						Голосом
					</button>
					<button
						className={`settings-option${config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect width="20" height="16" x="2" y="4" rx="2" />
							<path d="M6 8h.001" />
							<path d="M10 8h.001" />
							<path d="M14 8h.001" />
							<path d="M18 8h.001" />
							<path d="M8 12h.001" />
							<path d="M12 12h.001" />
							<path d="M16 12h.001" />
							<path d="M7 16h10" />
						</svg>
						Текстом
					</button>
				</div>
			</div>

			<p className="settings-summary">
				{plural(config.roundTimeSeconds, "секунда", "секунды", "секунд")} на раунд ·{" "}
				{plural(totalRounds, "раунд", "раунда", "раундов")} · ~
				{plural(totalMinutes, "минута", "минуты", "минут")}
			</p>

			{children}
		</div>
	);
}

function PerudoSettings({
	isHost,
	onUpdate,
	gameConfig,
	children,
}: {
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	gameConfig: Record<string, unknown> | undefined;
	children?: ReactNode;
}) {
	const config = {
		...DEFAULT_PERUDO_CONFIG,
		...gameConfig,
	} as PerudoConfig;

	const updateConfig = useCallback(
		(patch: Partial<PerudoConfig>) => {
			onUpdate({
				gameConfig: { ...config, ...patch },
			});
		},
		[onUpdate, config],
	);

	const timeLabel =
		config.turnTimeSeconds === 30
			? "30 сек"
			: config.turnTimeSeconds === 60
				? "1 мин"
				: config.turnTimeSeconds === 90
					? "1.5 мин"
					: `${config.turnTimeSeconds} сек`;

	if (!isHost) {
		return (
			<div className="game-settings">
				<p className="settings-summary">
					2–6 игроков · {timeLabel} на ход
					{config.palifico ? " · Палифико" : ""}
				</p>
				<p className="settings-summary">Игра на блеф с кубиками</p>
				{children}
			</div>
		);
	}

	return (
		<div className="game-settings">
			<h3 className="settings-title">Настройки игры</h3>

			<div className="settings-group">
				<span className="settings-label">Палифико</span>
				<div className="settings-options">
					<button
						className={`settings-option${config.palifico ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ palifico: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Включено
					</button>
					<button
						className={`settings-option${!config.palifico ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ palifico: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
						Выключено
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Время на ход</span>
				<div className="settings-options">
					{[
						{ value: 30, label: "30 сек" },
						{ value: 60, label: "1 мин" },
						{ value: 90, label: "1.5 мин" },
					].map(({ value, label }) => (
						<button
							key={value}
							className={`settings-option${config.turnTimeSeconds === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ turnTimeSeconds: value })}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
							{label}
						</button>
					))}
				</div>
			</div>

			<p className="settings-summary">Игра на блеф с кубиками</p>

			{children}
		</div>
	);
}

function MafiaSettings({
	isHost,
	playerCount,
	onUpdate,
	gameConfig,
	children,
}: {
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	gameConfig: Record<string, unknown> | undefined;
	children?: ReactNode;
}) {
	const config = {
		...DEFAULT_MAFIA_CONFIG,
		...gameConfig,
	} as MafiaConfig;

	const updateConfig = useCallback(
		(patch: Partial<MafiaConfig>) => {
			onUpdate({
				gameConfig: { ...config, ...patch },
			});
		},
		[onUpdate, config],
	);

	const mafiaCount = playerCount <= 7 ? 2 : playerCount <= 10 ? 3 : playerCount <= 13 ? 4 : 5;
	const hasDoctor = playerCount >= 7;

	if (!isHost) {
		return (
			<div className="game-settings">
				<p className="settings-summary">
					{mafiaCount} мафиози · комиссар{hasDoctor ? " · доктор" : ""} · обсуждение{" "}
					{config.discussionTimeSeconds} сек
				</p>
				<p className="settings-summary">Найдите мафию среди мирных жителей</p>
				{children}
			</div>
		);
	}

	return (
		<div className="game-settings">
			<h3 className="settings-title">Настройки игры</h3>

			<div className="settings-group">
				<span className="settings-label">Время обсуждения</span>
				<div className="settings-options">
					{[
						{ value: 60, label: "1 мин" },
						{ value: 90, label: "1.5 мин" },
						{ value: 120, label: "2 мин" },
					].map(({ value, label }) => (
						<button
							key={value}
							className={`settings-option${config.discussionTimeSeconds === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ discussionTimeSeconds: value })}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Показывать роль при смерти</span>
				<div className="settings-options">
					<button
						className={`settings-option${config.revealRoleOnDeath ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ revealRoleOnDeath: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						Да
					</button>
					<button
						className={`settings-option${!config.revealRoleOnDeath ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ revealRoleOnDeath: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
							<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
							<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
							<line x1="2" y1="2" x2="22" y2="22" />
						</svg>
						Нет
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Голосование</span>
				<div className="settings-options">
					<button
						className={`settings-option${!config.anonymousVoting ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ anonymousVoting: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M11 12h2" />
							<path d="M5.5 8.5 9 12l-3.5 3.5" />
							<path d="m15 5.5 3.5 3.5L15 12.5" />
							<rect width="20" height="20" x="2" y="2" rx="5" />
						</svg>
						Открытое
					</button>
					<button
						className={`settings-option${config.anonymousVoting ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ anonymousVoting: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
						Тайное
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Доктор лечит себя</span>
				<div className="settings-options">
					<button
						className={`settings-option${!config.doctorSelfHeal ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ doctorSelfHeal: false })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
						Нет
					</button>
					<button
						className={`settings-option${config.doctorSelfHeal ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ doctorSelfHeal: true })}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
							<path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66" />
							<path d="m18 15-2-2" />
							<path d="m15 18-2-2" />
						</svg>
						Да
					</button>
				</div>
			</div>

			<p className="settings-summary">
				{mafiaCount} мафиози · комиссар{hasDoctor ? " · доктор" : ""} ·{" "}
				{playerCount - mafiaCount - 1 - (hasDoctor ? 1 : 0)} мирных
			</p>

			{children}
		</div>
	);
}

function HangmanSettings({
	playerCount,
	children,
}: {
	isHost: boolean;
	playerCount: number;
	onUpdate: (settings: Partial<RoomSettings>) => void;
	gameConfig: Record<string, unknown> | undefined;
	children?: ReactNode;
}) {
	const totalRounds = 2 * playerCount;

	return (
		<div className="game-settings">
			<p className="settings-summary">
				{plural(totalRounds, "раунд", "раунда", "раундов")} · каждый игрок будет палачом дважды
			</p>
			<p className="settings-summary">Палач загадывает слово, остальные угадывают по очереди</p>
			{children}
		</div>
	);
}

export function GameSettings({
	settings,
	isHost,
	playerCount,
	onUpdate,
	children,
}: GameSettingsProps) {
	if (settings.gameId === "tapeworm") {
		return <TapewormSettings>{children}</TapewormSettings>;
	}

	if (settings.gameId === "crocodile") {
		return (
			<CrocodileSettings
				isHost={isHost}
				playerCount={playerCount}
				onUpdate={onUpdate}
				gameConfig={settings.gameConfig}
			>
				{children}
			</CrocodileSettings>
		);
	}

	if (settings.gameId === "perudo") {
		return (
			<PerudoSettings
				isHost={isHost}
				playerCount={playerCount}
				onUpdate={onUpdate}
				gameConfig={settings.gameConfig}
			>
				{children}
			</PerudoSettings>
		);
	}

	if (settings.gameId === "mafia") {
		return (
			<MafiaSettings
				isHost={isHost}
				playerCount={playerCount}
				onUpdate={onUpdate}
				gameConfig={settings.gameConfig}
			>
				{children}
			</MafiaSettings>
		);
	}

	if (settings.gameId === "hangman") {
		return (
			<HangmanSettings
				isHost={isHost}
				playerCount={playerCount}
				onUpdate={onUpdate}
				gameConfig={settings.gameConfig}
			>
				{children}
			</HangmanSettings>
		);
	}

	return (
		<WordGuessSettings
			isHost={isHost}
			playerCount={playerCount}
			onUpdate={onUpdate}
			gameConfig={settings.gameConfig}
		>
			{children}
		</WordGuessSettings>
	);
}
