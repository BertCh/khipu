import { useEffect, useRef } from "react";
import { dotPlot } from "#/lib/matching/seedTrace";

/** A run drawn as a diagonal stroke, in forward coordinates of `a`/`b`. */
export interface DotPlotRun {
	ai: number;
	bj: number;
	len: number;
}

export interface DotPlotProps {
	/** sequence A, drawn on x */
	a: ArrayLike<number>;
	/** sequence B, drawn on y */
	b: ArrayLike<number>;
	/** precomputed [i, j] pairs where a[i] === b[j] !== 0; computed from a/b if omitted */
	dots?: [number, number][];
	/** shared runs to draw as diagonal strokes, under the dots */
	runs?: DotPlotRun[];
	/** flip the B axis (reading b backwards turns an anti-diagonal into a diagonal); animates */
	flipB?: boolean;
	width?: number;
	height?: number;
	aLabel?: string;
	bLabel?: string;
	onCell?: (i: number, j: number) => void;
	/** force the canvas renderer below this n*m threshold too (mostly for tests) */
	canvasThreshold?: number;
}

const PAD = 28;

/**
 * A dot plot: a tick where sequence A and sequence B hold the same nonzero
 * value. SVG below `canvasThreshold` cells (default 200,000, generous for
 * any khipu pair), canvas above it.
 */
export default function DotPlot({
	a,
	b,
	dots,
	runs = [],
	flipB = false,
	width = 420,
	height = 420,
	aLabel = "A",
	bLabel = "B",
	onCell,
	canvasThreshold = 200_000,
}: DotPlotProps) {
	const n = a.length;
	const m = b.length;
	const pts = dots ?? dotPlot(a, b);
	const w = Math.max(1, width - PAD);
	const h = Math.max(1, height - PAD);
	const sx = (i: number) => PAD + (n > 1 ? (i / (n - 1)) * w : w / 2);
	const sy = (j: number) => {
		const t = m > 1 ? j / (m - 1) : 0.5;
		return PAD + (flipB ? t : 1 - t) * h;
	};

	const big = n * m > canvasThreshold;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		if (!big) return;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		// recomputed here (not the render-scope sx/sy) so this effect's own
		// dependency list stays complete and accurate
		const csx = (i: number) => PAD + (n > 1 ? (i / (n - 1)) * w : w / 2);
		const csy = (j: number) => {
			const t = m > 1 ? j / (m - 1) : 0.5;
			return PAD + (flipB ? t : 1 - t) * h;
		};
		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const style = getComputedStyle(canvas);
		ctx.fillStyle = style.getPropertyValue("--ink-3").trim() || "#8a857c";
		for (const [i, j] of pts) {
			ctx.beginPath();
			ctx.arc(csx(i), csy(j), 1.4, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.strokeStyle = style.getPropertyValue("--series-1").trim() || "#2a5fc4";
		ctx.lineWidth = 2;
		for (const r of runs) {
			ctx.beginPath();
			ctx.moveTo(csx(r.ai), csy(r.bj));
			ctx.lineTo(csx(r.ai + r.len - 1), csy(r.bj + r.len - 1));
			ctx.stroke();
		}
	}, [big, pts, runs, width, height, flipB, n, m, w, h]);

	if (big) {
		return (
			<div className="mtx-scroll">
				<canvas
					ref={canvasRef}
					className="dot-plot dot-plot-canvas"
					style={{ width, height }}
					role="img"
					aria-label={`Dot plot of ${pts.length} matching cells between ${aLabel} (${n}) and ${bLabel} (${m})`}
				/>
			</div>
		);
	}
	return (
		<div className="mtx-scroll">
			<svg
				className="dot-plot"
				viewBox={`0 0 ${width} ${height}`}
				width={width}
				height={height}
				role="img"
				aria-label={`Dot plot of ${pts.length} matching cells between ${aLabel} (${n}) and ${bLabel} (${m})`}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: a chart hit-target; every cell is also reachable via onCell's caller-provided UI */}
				<rect
					x={PAD}
					y={PAD}
					width={w}
					height={h}
					className="dot-plot-frame"
					onClick={
						onCell
							? (e) => {
									const rect = (
										e.target as SVGRectElement
									).getBoundingClientRect();
									const px = (e.clientX - rect.left) / rect.width;
									const py = (e.clientY - rect.top) / rect.height;
									const i = Math.round(px * (n - 1));
									const t = flipB ? py : 1 - py;
									const j = Math.round(t * (m - 1));
									onCell(i, j);
								}
							: undefined
					}
				/>
				{runs.map((r) => (
					<g
						key={`${r.ai}-${r.bj}-${r.len}`}
						className="dot-plot-run"
						style={{ transition: "transform 0.5s ease" }}
					>
						<line
							x1={sx(r.ai)}
							y1={sy(r.bj)}
							x2={sx(r.ai + r.len - 1)}
							y2={sy(r.bj + r.len - 1)}
						/>
					</g>
				))}
				{pts.map(([i, j]) => (
					<circle
						key={`${i}-${j}`}
						className="dot-plot-dot"
						cx={sx(i)}
						cy={sy(j)}
						r={1.6}
						style={{ transition: "cy 0.5s ease, cx 0.5s ease" }}
					/>
				))}
				<text
					x={width / 2}
					y={height - 6}
					textAnchor="middle"
					className="dot-plot-axis"
				>
					{aLabel} →
				</text>
				<text
					x={10}
					y={height / 2}
					textAnchor="middle"
					className="dot-plot-axis"
					transform={`rotate(-90 10 ${height / 2})`}
				>
					{bLabel} →
				</text>
			</svg>
		</div>
	);
}
