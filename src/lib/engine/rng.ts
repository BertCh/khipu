/**
 * Seeded randomness for the /next engine. Node-importable.
 *
 * mulberry32 is the same generator as src/lib/stories/chance.ts, and
 * shuffleInPlace draws in the same order as chance.shuffled (Fisher–Yates,
 * high index to low), so a shuffle seeded here matches a shuffle there.
 * Every null replicate gets its own seed from seedFor(...), which is what
 * makes pooled and single-thread runs identical.
 */
import type { Rng } from "../next/types.ts";

export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a 32-bit over the UTF-16 code units of parts.join("\u0001"). */
export function seedFor(...parts: (string | number)[]): number {
	const s = parts.join("\u0001");
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Fisher–Yates, high to low, in place (same draw order as chance.shuffled). */
export function shuffleInPlace(
	a: { length: number; [i: number]: unknown },
	rng: Rng,
): void {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const t = a[i];
		a[i] = a[j];
		a[j] = t;
	}
}

/**
 * Permute the entries of `a` within each block of indices (blocks need not be
 * contiguous; indices outside every block stay put). Blocks are shuffled in
 * the order given, each high to low.
 */
export function permuteWithin(
	a: Int32Array | Float64Array,
	blocks: number[][],
	rng: Rng,
): void {
	for (const b of blocks) {
		for (let i = b.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			const x = b[i];
			const y = b[j];
			const t = a[x];
			a[x] = a[y];
			a[y] = t;
		}
	}
}
