export interface BiasMatrixProps {
	/** n*n, row-major: matrix[i * n + j] = P(original index i lands at position j) */
	matrix: Float64Array;
	n: number;
	labels?: (i: number) => string;
	cellSize?: number;
}

/**
 * An n×n grid shaded by probability (Bostock's "will it shuffle?" bias
 * matrix): fair Fisher–Yates is uniform grey; a within-group null is
 * block-diagonal; a group-order null is block-permuted. Pair with
 * src/lib/matching/shuffleTrace.ts's `biasMatrix`.
 */
export default function BiasMatrix({
	matrix,
	n,
	labels,
	cellSize = 10,
}: BiasMatrixProps) {
	let max = 0;
	for (let k = 0; k < matrix.length; k++) if (matrix[k] > max) max = matrix[k];
	const w = n * cellSize;
	return (
		<div className="mtx-scroll">
			<svg
				className="bias-matrix"
				width={w}
				height={w}
				viewBox={`0 0 ${w} ${w}`}
				role="img"
				aria-label={`${n} by ${n} probability matrix of where each original position can land`}
			>
				{Array.from({ length: n * n }, (_, k) => {
					const i = Math.floor(k / n);
					const j = k % n;
					const p = matrix[k];
					return (
						<rect
							// biome-ignore lint/suspicious/noArrayIndexKey: a fixed n*n grid of cells, never reordered or filtered
							key={k}
							x={j * cellSize}
							y={i * cellSize}
							width={cellSize - 0.5}
							height={cellSize - 0.5}
							fill="var(--series-1)"
							fillOpacity={max > 0 ? p / max : 0}
						>
							<title>
								{`origin ${labels ? labels(i) : i} → position ${j}: ${(p * 100).toFixed(1)}%`}
							</title>
						</rect>
					);
				})}
			</svg>
		</div>
	);
}
