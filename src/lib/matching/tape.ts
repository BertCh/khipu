/**
 * The "number tape": a khipu's level-1 cords in ordinal order, as every
 * matching figure reads a khipu. Node-importable (relative imports, `.ts`
 * extensions), shared by the lib and the components in src/components/matching.
 *
 * `tapeOf` is deliberately the same sequence as scripts/shared_passages.py's
 * `values()` and public/data/next/corpus-lite.json's `seq` (see
 * src/lib/engine/corpus.ts): level-1 cords sorted by ordinal alone (top cords
 * included, in their recorded position), value = c.value ?? 0. It is *not*
 * the (group, ordinal) order `pendantValues` in src/lib/stories/chance.ts
 * uses, and it does not drop top cords — the pipeline chapters show top
 * cords on the tape like any other cord.
 */
import type { Cord, Khipu } from "../khipu/types.ts";

/** One level-1 cord as the tape shows it. */
export interface TapeCord {
	/** index into the tape (0-based, ordinal order) — the coordinate every trace uses */
	i: number;
	value: number;
	/** index into Khipu.groups, or -1 for a cord outside any group (e.g. most top cords) */
	group: number;
	/** raw Cord.color (e.g. "W", "MB:LB"); see NumberTape for how it becomes a swatch */
	color: string | null;
	/** Cord.name, e.g. "p12" */
	name: string;
}

function isLevel1(c: Cord): boolean {
	return c.level === 1;
}

/** A khipu's level-1 cords, sorted by ordinal, exactly as shared_passages.values(). */
export function tapeOf(k: Khipu): TapeCord[] {
	return k.cords
		.filter(isLevel1)
		.sort((a, b) => a.ordinal - b.ordinal)
		.map((c, i) => ({
			i,
			value: c.value ?? 0,
			group: c.group ?? -1,
			color: c.color,
			name: c.name,
		}));
}

/** Just the values, in the same order as tapeOf — what the traces operate on. */
export function valuesOf(k: Khipu): number[] {
	return k.cords
		.filter(isLevel1)
		.sort((a, b) => a.ordinal - b.ordinal)
		.map((c) => c.value ?? 0);
}

export interface TapeLayoutOpts {
	/** tile width in px (default 18) */
	tile?: number;
	/** gap between adjacent tiles in the same group (default 2) */
	gap?: number;
	/** extra gap inserted where the group changes (default 10) */
	groupGap?: number;
}

/**
 * x position of every tile, left edge, so other figures (dot plots,
 * permutation arcs) can line up with a NumberTape drawn with the same cords
 * and options. `cords` is read in the order given — pass a reordered or
 * reversed array to lay out that order (see NumberTape's `reversed` prop,
 * which reverses the array itself before calling this).
 */
export function tapeX(
	cords: readonly Pick<TapeCord, "group">[],
	opts: TapeLayoutOpts = {},
): number[] {
	const tile = opts.tile ?? 18;
	const gap = opts.gap ?? 2;
	const groupGap = opts.groupGap ?? 10;
	const xs: number[] = [];
	let x = 0;
	for (let i = 0; i < cords.length; i++) {
		if (i > 0 && cords[i].group !== cords[i - 1].group) x += groupGap;
		xs.push(x);
		x += tile + gap;
	}
	return xs;
}

/** Total width a tape of `cords` needs at `opts`, for an SVG viewBox. */
export function tapeWidth(
	cords: readonly Pick<TapeCord, "group">[],
	opts: TapeLayoutOpts = {},
): number {
	if (cords.length === 0) return 0;
	const tile = opts.tile ?? 18;
	const xs = tapeX(cords, opts);
	return xs[xs.length - 1] + tile;
}
