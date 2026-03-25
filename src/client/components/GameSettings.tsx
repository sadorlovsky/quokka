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
						Каждый за себя
					</button>
					<button
						className={`settings-option${config.mode === "teams" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "teams" })}
						disabled={playerCount < 4}
						title={playerCount < 4 ? "Нужно минимум 4 игрока" : undefined}
					>
						Команды
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Сложность слов</span>
				<div className="settings-options">
					{(
						[
							{ value: "all" as const, label: "Любые" },
							{ value: 1 as const, label: "Лёгкие" },
							{ value: 2 as const, label: "Средние" },
							{ value: 3 as const, label: "Сложные" },
						] as const
					).map(({ value, label }) => (
						<button
							key={String(value)}
							className={`settings-option${config.difficulty === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ difficulty: value })}
						>
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
						Голосом
					</button>
					<button
						className={`settings-option${config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: true })}
					>
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
						Жесты
					</button>
					<button
						className={`settings-option${config.mode === "drawing" ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ mode: "drawing", roundTimeSeconds: 120 })}
					>
						Рисование
					</button>
				</div>
			</div>

			<div className="settings-group">
				<span className="settings-label">Сложность слов</span>
				<div className="settings-options">
					{(
						[
							{ value: "all" as const, label: "Любые" },
							{ value: 1 as const, label: "Лёгкие" },
							{ value: 2 as const, label: "Средние" },
							{ value: 3 as const, label: "Сложные" },
						] as const
					).map(({ value, label }) => (
						<button
							key={String(value)}
							className={`settings-option${config.difficulty === value ? " settings-option--active" : ""}`}
							onClick={() => updateConfig({ difficulty: value })}
						>
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
						Голосом
					</button>
					<button
						className={`settings-option${config.textMode ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ textMode: true })}
					>
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
						Включено
					</button>
					<button
						className={`settings-option${!config.palifico ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ palifico: false })}
					>
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
						Да
					</button>
					<button
						className={`settings-option${!config.revealRoleOnDeath ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ revealRoleOnDeath: false })}
					>
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
						Открытое
					</button>
					<button
						className={`settings-option${config.anonymousVoting ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ anonymousVoting: true })}
					>
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
						Нет
					</button>
					<button
						className={`settings-option${config.doctorSelfHeal ? " settings-option--active" : ""}`}
						onClick={() => updateConfig({ doctorSelfHeal: true })}
					>
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
