/**
 * Small statistics for the matching chapters, re-using
 * src/lib/engine/stats.ts (the same +1-corrected tails the /next engine
 * uses) plus a histogram bucketer for NullHistogram.
 */
export { lowerP, upperP } from "../engine/stats.ts";

export interface HistogramBin {
	lo: number;
	hi: number;
	count: number;
}

/**
 * Equal-width bins covering `domain` (or the data's own min/max). A value
 * equal to the domain's upper edge falls in the last bin.
 */
export function histogram(
	values: ArrayLike<number>,
	binCount: number,
	domain?: [number, number],
): HistogramBin[] {
	const n = values.length;
	let lo: number;
	let hi: number;
	if (domain) {
		[lo, hi] = domain;
	} else {
		lo = Infinity;
		hi = -Infinity;
		for (let i = 0; i < n; i++) {
			const v = values[i];
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		if (!Number.isFinite(lo)) {
			lo = 0;
			hi = 0;
		}
	}
	const span = hi - lo || 1;
	const bins: HistogramBin[] = Array.from({ length: binCount }, (_, b) => ({
		lo: lo + (span * b) / binCount,
		hi: lo + (span * (b + 1)) / binCount,
		count: 0,
	}));
	for (let i = 0; i < n; i++) {
		const v = values[i];
		let b = Math.floor(((v - lo) / span) * binCount);
		if (b < 0) b = 0;
		if (b >= binCount) b = binCount - 1;
		bins[b].count++;
	}
	return bins;
}
