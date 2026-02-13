import { useCallback, useEffect, useRef } from "react";
import type { DrawingEvent } from "../../contexts/ConnectionContext";
import { useConnection } from "../../contexts/ConnectionContext";

interface DrawingCanvasProps {
	readonly?: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const BATCH_INTERVAL_MS = 50;

function drawStroke(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
	if (points.length === 0) {
		return;
	}
	ctx.strokeStyle = "#000";
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(points[0]!.x * CANVAS_WIDTH, points[0]!.y * CANVAS_HEIGHT);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i]!.x * CANVAS_WIDTH, points[i]!.y * CANVAS_HEIGHT);
	}
	ctx.stroke();
}

function clearCanvas(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function redrawAll(canvas: HTMLCanvasElement, strokes: { x: number; y: number }[][]) {
	clearCanvas(canvas);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	for (const stroke of strokes) {
		drawStroke(ctx, stroke);
	}
}

export function DrawingCanvas({ readonly = false }: DrawingCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isDrawing = useRef(false);
	const isNewStroke = useRef(false);
	const pendingPoints = useRef<{ x: number; y: number }[]>([]);
	const strokeHistory = useRef<{ x: number; y: number }[][]>([]);
	const { send, onDrawingEvent } = useConnection();

	// Flush batched points to server
	const flush = useCallback(() => {
		if (pendingPoints.current.length === 0) {
			return;
		}
		const points = pendingPoints.current;
		const newStroke = isNewStroke.current;
		isNewStroke.current = false;
		// Keep last point so next batch connects seamlessly
		if (isDrawing.current) {
			pendingPoints.current = [points[points.length - 1]!];
		} else {
			pendingPoints.current = [];
		}
		send({ type: "drawStroke", points, newStroke: newStroke || undefined });
	}, [send]);

	// Batch interval for sending strokes
	useEffect(() => {
		if (readonly) {
			return;
		}
		const interval = setInterval(flush, BATCH_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [readonly, flush]);

	// Normalized position (0–1)
	const getPos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return { x: 0, y: 0 };
		}
		const rect = canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height,
		};
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (readonly) {
				return;
			}
			isDrawing.current = true;
			isNewStroke.current = true;
			// Flush any leftover from previous stroke
			flush();
			const pos = getPos(e);
			pendingPoints.current = [pos];
			isNewStroke.current = true;
			// Start new stroke in history
			strokeHistory.current.push([pos]);

			// Draw locally immediately
			const canvas = canvasRef.current;
			const ctx = canvas?.getContext("2d");
			if (ctx) {
				ctx.strokeStyle = "#000";
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.beginPath();
				ctx.moveTo(pos.x * CANVAS_WIDTH, pos.y * CANVAS_HEIGHT);
			}
			(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
		},
		[readonly, getPos, flush],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (readonly || !isDrawing.current) {
				return;
			}
			const pos = getPos(e);
			pendingPoints.current.push(pos);
			// Append to current stroke in history
			const current = strokeHistory.current[strokeHistory.current.length - 1];
			if (current) {
				current.push(pos);
			}

			// Draw locally immediately
			const canvas = canvasRef.current;
			const ctx = canvas?.getContext("2d");
			if (ctx) {
				ctx.lineTo(pos.x * CANVAS_WIDTH, pos.y * CANVAS_HEIGHT);
				ctx.stroke();
				// Reset path to avoid re-stroking accumulated segments
				ctx.beginPath();
				ctx.moveTo(pos.x * CANVAS_WIDTH, pos.y * CANVAS_HEIGHT);
			}
		},
		[readonly, getPos],
	);

	const handlePointerUp = useCallback(() => {
		if (isDrawing.current) {
			isDrawing.current = false;
			flush();
		}
	}, [flush]);

	const handleClear = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		clearCanvas(canvas);
		strokeHistory.current = [];
		send({ type: "drawClear" });
	}, [send]);

	const handleUndo = useCallback(() => {
		if (strokeHistory.current.length === 0) {
			return;
		}
		strokeHistory.current.pop();
		const canvas = canvasRef.current;
		if (canvas) {
			redrawAll(canvas, strokeHistory.current);
		}
		send({ type: "drawUndo" });
	}, [send]);

	// Listen for drawing events from server (for readonly viewers)
	useEffect(() => {
		if (!readonly) {
			return;
		}
		const unsubscribe = onDrawingEvent((event: DrawingEvent) => {
			const canvas = canvasRef.current;
			if (!canvas) {
				return;
			}
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				return;
			}

			switch (event.type) {
				case "drawStroke": {
					drawStroke(ctx, event.points);
					const history = strokeHistory.current;
					if (event.newStroke || history.length === 0) {
						history.push([...event.points]);
					} else {
						history[history.length - 1]!.push(...event.points);
					}
					break;
				}
				case "drawClear":
					clearCanvas(canvas);
					strokeHistory.current = [];
					break;
				case "drawUndo":
					strokeHistory.current.pop();
					redrawAll(canvas, strokeHistory.current);
					break;
				case "drawHistory":
					strokeHistory.current = event.strokes.map((s) => [...s]);
					redrawAll(canvas, strokeHistory.current);
					break;
			}
		});
		return unsubscribe;
	}, [readonly, onDrawingEvent]);

	// Init canvas with white background
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		clearCanvas(canvas);
	}, []);

	return (
		<div className="crocodile-canvas-container">
			<canvas
				ref={canvasRef}
				className={`crocodile-canvas${readonly ? " crocodile-canvas--readonly" : ""}`}
				width={CANVAS_WIDTH}
				height={CANVAS_HEIGHT}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerLeave={handlePointerUp}
			/>
			{!readonly && (
				<div className="crocodile-canvas-actions">
					<button type="button" className="btn crocodile-canvas-clear" onClick={handleUndo}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>Отменить</title>
							<path d="M3 7v6h6" />
							<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
						</svg>
						Отменить
					</button>
					<button type="button" className="btn crocodile-canvas-clear" onClick={handleClear}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>Очистить</title>
							<path d="M3 6h18" />
							<path d="M8 6V4h8v2" />
							<path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" />
						</svg>
						Очистить
					</button>
				</div>
			)}
		</div>
	);
}
