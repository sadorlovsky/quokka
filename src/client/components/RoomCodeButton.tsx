import { useCallback, useState } from "react";
import "./RoomCodeButton.css";

interface RoomCodeButtonProps {
	code: string;
}

export function RoomCodeButton({ code }: RoomCodeButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		const url = `${location.origin}/room/${code}`;
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// Fallback for non-secure contexts (http://, WebView, etc.)
			const ta = document.createElement("textarea");
			ta.value = url;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [code]);

	return (
		<button
			type="button"
			className={`room-code-btn${copied ? " room-code-btn--copied" : ""}`}
			onClick={handleCopy}
			title="Нажмите, чтобы скопировать ссылку"
		>
			<span className="room-code-btn-default" aria-hidden={copied}>
				<span className="room-code-btn-value">{code}</span>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<title>Скопировать</title>
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
				</svg>
			</span>
			{copied && (
				<span className="room-code-btn-copied-overlay">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Скопировано</title>
						<path d="M20 6L9 17l-5-5" />
					</svg>
					<span className="room-code-btn-toast">Скопировано</span>
				</span>
			)}
		</button>
	);
}
