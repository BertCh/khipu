import type { SwStep, SwTraceResult } from "#/lib/matching/swTrace";

export interface DpGridProps {
	result: SwTraceResult;
	/** show only the cells filled by this point in `result.order` (default: all) */
	step?: number;
	onCell?: (i: number, j: number) => void;
	/** traceback to overlay (default: `result.path`); pass `null` to hide it */
	path?: SwStep[] | null;
	cellSize?: number;
}

const OP_CLASS: Record<SwStep["op"], string> = {
	match: "is-match",
	slip: "is-slip",
	mismatch: "is-mismatch",
	gapA: "is-gap",
	gapB: "is-gap",
};

/**
 * The Smith–Waterman–Gotoh grid as a heat-coloured matrix: fill opacity by
 * H score, row/col headers of the aligned values, an optional traceback
 * overlay, and a click callback for "traceback from any cell".
 */
export default function DpGrid({
	result,
	step,
	onCell,
	path,
	cellSize = 22,
}: DpGridProps) {
	const { n, m, H, order, a, b } = result;
	const w = m + 1;
	const idx = (i: number, j: number) => i * w + j;
	const limit = step ?? order.length;
	const filled = new Set(order.slice(0, limit));
	let maxH = 1;
	for (const key of filled) if (H[key] > maxH) maxH = H[key];
	const overlay = path === undefined ? result.path : path;
	const pathOp = new Map((overlay ?? []).map((s) => [idx(s.i, s.j), s.op]));
	const headerSize = cellSize + 8;
	const totalW = headerSize + (m + 1) * cellSize;
	const totalH = headerSize + (n + 1) * cellSize;

	const cells: { i: number; j: number }[] = [];
	for (let i = 0; i <= n; i++)
		for (let j = 0; j <= m; j++) cells.push({ i, j });

	return (
		<div className="mtx-scroll">
			<svg
				className="dp-grid"
				width={totalW}
				height={totalH}
				viewBox={`0 0 ${totalW} ${totalH}`}
				role="img"
				aria-label={`Alignment matrix, ${n} by ${m} cords, best score ${result.best.score.toFixed(1)}`}
			>
				{Array.from({ length: m }, (_, jj) => jj + 1).map((j) => (
					<text
						key={`ch${j}`}
						className="dp-grid-head"
						x={headerSize + j * cellSize + cellSize / 2}
						y={headerSize - 10}
						textAnchor="middle"
					>
						{b[j - 1]}
					</text>
				))}
				{Array.from({ length: n }, (_, ii) => ii + 1).map((i) => (
					<text
						key={`rh${i}`}
						className="dp-grid-head"
						x={headerSize - 8}
						y={headerSize + i * cellSize + cellSize / 2 + 4}
						textAnchor="end"
					>
						{a[i - 1]}
					</text>
				))}
				{cells.map(({ i, j }) => {
					const key = idx(i, j);
					const isFilled = i === 0 || j === 0 || filled.has(key);
					const v = H[key] ?? 0;
					const pct = isFilled ? Math.max(0, v) / maxH : 0;
					const op = pathOp.get(key);
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: a chart hit-target; every cell also carries a <title> and a caller-provided readout
						<rect
							key={key}
							className={`dp-grid-cell${op ? ` ${OP_CLASS[op]}` : ""}`}
							x={headerSize + j * cellSize}
							y={headerSize + i * cellSize}
							width={cellSize - 1}
							height={cellSize - 1}
							fill="var(--series-1)"
							fillOpacity={isFilled ? Math.min(1, 0.06 + pct * 0.88) : 0}
							onClick={onCell ? () => onCell(i, j) : undefined}
						>
							<title>{`(${i}, ${j})  H = ${v.toFixed(2)}`}</title>
						</rect>
					);
				})}
			</svg>
		</div>
	);
}
