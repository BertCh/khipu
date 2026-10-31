import { interpolateRainbow, interpolateViridis } from "d3-scale-chromatic";
import { inkOn } from "#/lib/khipu/colors";

export interface OriginStripProps {
	n: number;
	/** perm[pos] = the original index now sitting at pos */
	perm: ArrayLike<number>;
	cellSize?: number;
	/** print the position number every N cells (0 = never, default 0) */
	labelEvery?: number;
	/** 'rainbow' (cyclical — a full shuffle reads as a scramble) or 'viridis' (sequential) */
	scheme?: "rainbow" | "viridis";
}

function hexOf(t: number, scheme: "rainbow" | "viridis"): string {
	return scheme === "rainbow" ? interpolateRainbow(t) : interpolateViridis(t);
}

/**
 * A row of cells coloured by each slot's ORIGINAL position (Bostock's "will
 * it shuffle?" idiom): a fair shuffle reads as a scramble of colour; a
 * within-group shuffle keeps bands of colour; a group-order shuffle keeps
 * whole bands intact but reorders them. Text labels (not just colour) carry
 * the original index, so the strip still reads under a colour-vision
 * deficiency or in print.
 */
export default function OriginStrip({
	n,
	perm,
	cellSize = 16,
	labelEvery = 0,
	scheme = "viridis",
}: OriginStripProps) {
	const w = n * cellSize;
	const h = cellSize + (labelEvery > 0 ? 14 : 0);
	return (
		<div className="mtx-scroll">
			<svg
				className="origin-strip"
				width={w}
				height={h}
				viewBox={`0 0 ${w} ${h}`}
				role="img"
				aria-label={`${n} positions, coloured by original index`}
			>
				{Array.from({ length: n }, (_, pos) => {
					const origin = perm[pos];
					const fill = hexOf(n > 1 ? origin / (n - 1) : 0, scheme);
					return (
						<g
							key={origin}
							className="origin-cell"
							style={{ transform: `translateX(${pos * cellSize}px)` }}
						>
							<rect width={cellSize - 1} height={cellSize - 1} fill={fill} />
							{labelEvery > 0 && pos % labelEvery === 0 && (
								<text
									x={(cellSize - 1) / 2}
									y={cellSize + 10}
									textAnchor="middle"
									fill="var(--ink-3)"
								>
									{origin}
								</text>
							)}
							<title>
								position {pos}: originally {origin}
							</title>
							{cellSize >= 14 && (
								<text
									x={(cellSize - 1) / 2}
									y={(cellSize - 1) / 2 + 3}
									textAnchor="middle"
									fontSize={cellSize > 18 ? 9 : 7}
									fill={inkOn(fill)}
								>
									{origin}
								</text>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}
