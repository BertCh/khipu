import { lowerP, upperP } from "#/lib/matching/stats";

export interface NullHistogramProps {
	/** null draws so far — pass a growing prefix to animate dots dropping in one at a time */
	nulls: number[];
	observed: number;
	/** which tail counts as "as extreme or more" (default 'upper') */
	direction?: "upper" | "lower";
	width?: number;
	height?: number;
	/** label before the observed value, e.g. "as tied" (default "observed") */
	label?: string;
	/** how to print `observed` next to the tick and in the aria-label (default: the raw number — pass this for a float statistic, e.g. `(v) => v.toFixed(2)`) */
	formatObserved?: (v: number) => string;
}

/**
 * A stacking-dot null distribution (the "accretion" idiom): each shuffle is
 * one dot, stacked on its value's column; the observed value is a labelled
 * tick with its tail shaded; a p readout uses the same +1-corrected tail as
 * the rest of the site (src/lib/engine/stats.ts).
 */
export default function NullHistogram({
	nulls,
	observed,
	direction = "upper",
	width = 480,
	height = 140,
	label = "observed",
	formatObserved = (v: number) => String(v),
}: NullHistogramProps) {
	const pad = 16;
	const r = 3.2;
	const innerW = width - 2 * pad;
	const all = nulls.length ? [...nulls, observed] : [observed];
	const lo = Math.min(...all);
	const hi = Math.max(...all);
	const span = Math.max(1, hi - lo);
	const cols = Math.max(8, Math.floor(innerW / (2 * r + 1)));
	const bin = Math.max(1, Math.ceil((span + 1) / cols));
	const nb = Math.floor(span / bin) + 1;
	const sx = (v: number) =>
		pad + ((Math.floor((v - lo) / bin) + 0.5) / nb) * innerW;
	const heights = new Map<number, number>();
	const pts = nulls.map((v) => {
		const b = Math.floor((v - lo) / bin);
		const k = heights.get(b) ?? 0;
		heights.set(b, k + 1);
		return { v, k };
	});
	const tallest = Math.max(1, ...heights.values());
	const base = height - 26;
	const top = Math.max(16, base - tallest * (2 * r + 1) - 6);
	const p =
		direction === "upper" ? upperP(observed, nulls) : lowerP(observed, nulls);
	const pLabel = p < 0.01 ? "< 0.01" : p.toFixed(2);
	const tailX = sx(observed);

	return (
		<div className="mtx-scroll">
			<svg
				className="null-histogram"
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${nulls.length} shuffles; ${label} value ${formatObserved(observed)}; p ${pLabel}`}
			>
				{direction === "upper" ? (
					<rect
						x={tailX}
						y={top}
						width={Math.max(0, width - pad - tailX)}
						height={base - top}
						className="null-hist-tail"
					/>
				) : (
					<rect
						x={pad}
						y={top}
						width={Math.max(0, tailX - pad)}
						height={base - top}
						className="null-hist-tail"
					/>
				)}
				<line
					x1={pad}
					x2={width - pad}
					y1={base + 1}
					y2={base + 1}
					className="null-hist-axis"
				/>
				{pts.map((pt, i) => (
					<circle
						// biome-ignore lint/suspicious/noArrayIndexKey: dots are an accumulating, order-stable draw sequence
						key={i}
						cx={sx(pt.v)}
						cy={base - r - pt.k * (2 * r + 1)}
						r={r}
						className="null-hist-dot"
						style={{ transition: "cx 0.3s ease" }}
					/>
				))}
				<line
					x1={tailX}
					x2={tailX}
					y1={top - 4}
					y2={base + 1}
					className="null-hist-obs"
				/>
				<text
					x={tailX}
					y={top - 8}
					textAnchor={
						tailX > width - 80 ? "end" : tailX < 80 ? "start" : "middle"
					}
					className="null-hist-obs-label"
				>
					{label}: {formatObserved(observed)}
				</text>
				<text
					x={width - pad}
					y={height - 6}
					textAnchor="end"
					className="null-hist-p"
				>
					p {pLabel}
				</text>
				<text x={pad} y={height - 6} className="null-hist-n">
					{nulls.length} shuffles
				</text>
			</svg>
		</div>
	);
}
