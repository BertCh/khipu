import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable } from "#/lib/khipu/types";
import { type TapeCord, tapeX } from "#/lib/matching/tape";

/**
 * One tile's state, for colouring a cord as a trace steps through it.
 * 'idle': not yet touched. 'dim': ruled out (e.g. a non-informative window).
 * 'window': inside the window currently sliding. 'seed': part of an indexed,
 * matching window. 'run': part of a confirmed shared run. 'slip' / 'mismatch'
 * / 'gap': an alignment outcome (src/lib/matching/swTrace.ts). 'focus': a
 * one-off highlight (e.g. the cord under the pointer).
 */
export type TileState =
	| "idle"
	| "dim"
	| "window"
	| "seed"
	| "run"
	| "slip"
	| "mismatch"
	| "gap"
	| "focus";

const COLOR_OP_RE = /[:\-%^]/;

/** The tile's swatch colour: the first Ascher code in a (possibly compound) colour string. */
function primarySwatch(color: string | null, colors: ColorTable): string {
	if (!color) return hexFor(undefined, colors);
	return hexFor(color.split(COLOR_OP_RE)[0], colors);
}

export interface NumberTapeProps {
	cords: TapeCord[];
	/** per-cord tile state, looked up by the cord's tape index `i` (not its position in `cords`) */
	state?: (i: number) => TileState;
	colors: ColorTable;
	/** tile edge length in px (default 18) */
	tile?: number;
	/** extra gap in px where the group changes (default 10) */
	groupGap?: number;
	/** accessible label for the figure */
	label?: string;
	/** draw `cords` in reverse order (reading the khipu backwards); `i` in `state`/`onHover` is still the original tape index */
	reversed?: boolean;
	onHover?: (i: number | null) => void;
}

/**
 * One row of cord tiles: a colour swatch (the cord's Ascher colour) over its
 * value in tabular figures, zero drawn hollow, wider gaps between groups.
 * Tiles are keyed by the cord's tape index, so re-rendering with the same
 * cords in a new order (e.g. a sort-to-signature animation) animates each
 * tile's position via a CSS transform transition rather than remounting it.
 */
export default function NumberTape({
	cords,
	state,
	colors,
	tile = 18,
	groupGap = 10,
	label,
	reversed = false,
	onHover,
}: NumberTapeProps) {
	const order = reversed ? [...cords].reverse() : cords;
	const xs = tapeX(order, { tile, groupGap });
	const width = xs.length ? xs[xs.length - 1] + tile : 0;
	const height = tile + 18;
	return (
		<div className="mtx-scroll">
			<svg
				className="number-tape"
				viewBox={`0 0 ${Math.max(width, 1)} ${height}`}
				width={width}
				height={height}
				role="img"
				aria-label={label ?? `${cords.length} cords, values in order`}
				onPointerLeave={() => onHover?.(null)}
			>
				{order.map((c, k) => {
					const st = state?.(c.i) ?? "idle";
					const hollow = c.value === 0;
					return (
						<g
							key={c.i}
							className={`tape-tile tape-tile-${st}`}
							style={{ transform: `translateX(${xs[k]}px)` }}
							onPointerEnter={() => onHover?.(c.i)}
						>
							<rect
								className="tape-swatch"
								width={tile}
								height={tile}
								rx={3}
								fill={hollow ? "none" : primarySwatch(c.color, colors)}
							/>
							<text className="tape-value" x={tile / 2} y={tile + 13}>
								{c.value}
							</text>
							<title>
								{c.name}: {c.value}
							</title>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
