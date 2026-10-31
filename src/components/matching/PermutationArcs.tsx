export interface PermutationArcsProps {
	n: number;
	/** perm[pos] = the original index now sitting at pos (fisherYates/nullPerm's convention) */
	perm: ArrayLike<number>;
	labels?: (origin: number) => string;
	/**
	 * 'rows': a before row (original order) and an after row (perm's order),
	 * joined by a line per index. 'arcsAboveOne': one row in `perm`'s order,
	 * with `swaps` drawn as arcs above it (the Fisher–Yates idiom — pass a
	 * prefix of `swaps` to animate the shuffle building up).
	 */
	mode?: "rows" | "arcsAboveOne";
	swaps?: [number, number][];
	/** original indices to draw emphasised */
	highlight?: Set<number>;
	cellSize?: number;
	width?: number;
}

/** Two rows or one row with arcs, showing how a permutation moved every index. */
export default function PermutationArcs({
	n,
	perm,
	labels,
	mode = "rows",
	swaps = [],
	highlight,
	cellSize = 22,
	width,
}: PermutationArcsProps) {
	const w = width ?? Math.max(1, n * cellSize);
	const x = (pos: number) => (pos + 0.5) * (w / n);
	const lbl = labels ?? ((i: number) => String(i));
	const isHl = (origin: number) => highlight?.has(origin) ?? false;

	if (mode === "arcsAboveOne") {
		// the row sits low enough that even the widest possible arc (between
		// position 0 and position n - 1) fits inside the viewBox instead of
		// being clipped above it — a fixed, small rowY clipped every arc wider
		// than a couple of cells for any n much above 4.
		const maxR = ((n - 1) * (w / n)) / 2;
		const rowY = maxR * 0.85 + 14;
		const h = rowY + 18;
		return (
			<div className="mtx-scroll">
				<svg
					className="perm-arcs perm-arcs-one"
					width={w}
					height={h}
					viewBox={`0 0 ${w} ${h}`}
					role="img"
					aria-label={`${swaps.length} swaps drawn as arcs over ${n} positions`}
				>
					{swaps.map(([i, j], k) => {
						if (i === j) return null;
						const xLeft = Math.min(x(i), x(j));
						const xRight = Math.max(x(i), x(j));
						const r = (xRight - xLeft) / 2;
						return (
							<path
								// biome-ignore lint/suspicious/noArrayIndexKey: swaps are an ordered draw sequence, not identified items
								key={k}
								className="perm-arc"
								d={`M ${xLeft} ${rowY} A ${r} ${r * 0.85} 0 0 1 ${xRight} ${rowY}`}
							/>
						);
					})}
					{Array.from({ length: n }, (_, pos) => (
						<g
							// keyed by origin (not position) so a cell tracks its own
							// value as `perm` changes step by step, and the position
							// transform transition above actually animates a move
							key={perm[pos]}
							className={`perm-cell${isHl(perm[pos]) ? " is-hl" : ""}`}
							style={{ transform: `translate(${x(pos)}px, ${rowY}px)` }}
						>
							<circle r={9} />
							<text y={4}>{lbl(perm[pos])}</text>
						</g>
					))}
				</svg>
			</div>
		);
	}

	const h = 116;
	const topY = 22;
	const botY = h - 22;
	const inverse = new Array<number>(n);
	for (let pos = 0; pos < n; pos++) inverse[perm[pos]] = pos;
	return (
		<div className="mtx-scroll">
			<svg
				className="perm-arcs perm-arcs-rows"
				width={w}
				height={h}
				viewBox={`0 0 ${w} ${h}`}
				role="img"
				aria-label={`Permutation of ${n} positions, before and after`}
			>
				{Array.from({ length: n }, (_, i) => (
					<line
						// biome-ignore lint/suspicious/noArrayIndexKey: i is the origin index itself (0..n-1), stable across renders
						key={i}
						className={`perm-line${isHl(i) ? " is-hl" : ""}`}
						x1={x(i)}
						y1={topY}
						x2={x(inverse[i])}
						y2={botY}
						style={{ transition: "x2 0.5s ease" }}
					/>
				))}
				{Array.from({ length: n }, (_, i) => (
					<g
						// biome-ignore lint/suspicious/noArrayIndexKey: i is the origin index itself (0..n-1), stable across renders
						key={`t${i}`}
						className={`perm-cell${isHl(i) ? " is-hl" : ""}`}
						style={{ transform: `translate(${x(i)}px, ${topY}px)` }}
					>
						<circle r={9} />
						<text y={4}>{lbl(i)}</text>
					</g>
				))}
				{Array.from({ length: n }, (_, pos) => (
					<g
						// keyed by origin so a cell animates its move as `perm` changes
						key={`b${perm[pos]}`}
						className={`perm-cell${isHl(perm[pos]) ? " is-hl" : ""}`}
						style={{ transform: `translate(${x(pos)}px, ${botY}px)` }}
					>
						<circle r={9} />
						<text y={4}>{lbl(perm[pos])}</text>
					</g>
				))}
			</svg>
		</div>
	);
}
