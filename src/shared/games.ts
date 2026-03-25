export const GAME_META: Record<
	string,
	{
		emoji: string;
		name: string;
		description?: string;
		players?: string;
		comingSoon?: boolean;
	}
> = {
	"word-guess": {
		emoji: "👒",
		name: "Шляпа",
		description:
			"Объясняйте слова товарищам по команде, не используя однокоренные. Классическая командная игра на время.",
		players: "4–16",
	},
	tapeworm: {
		emoji: "🪱",
		name: "Червь",
		description:
			"Составляйте слова из букв на игровом поле, соединяя их в цепочку. Чем длиннее слово — тем больше очков.",
		players: "2–8",
	},
	crocodile: {
		emoji: "🐊",
		name: "Крокодил",
		description:
			"Покажите загаданное слово жестами, мимикой и движениями — без единого звука. Остальные угадывают.",
		players: "3–16",
	},
	hangman: {
		emoji: "💀",
		name: "Виселица",
		description:
			"Угадайте слово по буквам, пока человечек не повешен. Каждая ошибка — шаг к проигрышу.",
		players: "2–8",
	},
	perudo: {
		emoji: "🎲",
		name: "Перудо",
		description:
			"Блефуйте и разоблачайте блеф! Делайте ставки на количество кубиков, скрытых под стаканами.",
		players: "2–6",
	},
	mafia: {
		emoji: "🔫",
		name: "Мафия",
		description:
			"Город засыпает. Просыпается мафия... Найдите мафиози среди мирных жителей, пока они не захватили город.",
		players: "6–16",
	},
	trivia: { emoji: "❓", name: "Викторина", comingSoon: true },
	codenames: { emoji: "🕵️", name: "Codenames", comingSoon: true },
	battleship: { emoji: "🚢", name: "Морской бой", comingSoon: true },
	"who-am-i": { emoji: "🤔", name: "Кто я?", comingSoon: true },
	jeopardy: { emoji: "🏆", name: "Свояк", comingSoon: true },
};
