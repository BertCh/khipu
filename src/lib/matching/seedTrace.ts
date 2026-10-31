/**
 * An instrumented, single-pair port of the seed-and-extend scan in
 * src/lib/engine/tests/passages.ts (`pairRun` / `pairRuns`): the same
 * algorithm, emitting one step per thing it does, so a player can scrub
 * through "slide the window → index A → look up B → extend → run".
 *
 * `informative5` / `informative4` are imported from passages.ts (exported
 * there for this reason) and are never reimplemented here. `extend`,
 * `windowKey` and the span bookkeeping are small enough that this file ports
 * them directly rather than importing passages.ts's unexported internals;
 * `seedTrace(a, b, opts).spans` is checked against `pairRun(a, b, opts)` in
 * scripts/matching/check_traces.mts.
 *
 * `reverseB` scans `b` reversed throughout (window/index/lookup/extend steps
 * are all in reversed-b coordinates, exactly like reading that khipu's tape
 * backwards); only the final `spans` are mapped back to forward coordinates,
 * the same way `pairRun`'s `rev` direction is.
 */
import { informative4, informative5 } from "../engine/tests/passages.ts";

export type WindowSize = 5 | 4;

export interface SeedOptions {
	W: WindowSize | "5+4";
	minMax: number;
	/** scan b reversed; final spans are still forward-coordinate */
	reverseB?: boolean;
}

export const DEFAULT_SEED_OPTIONS: SeedOptions = { W: "5+4", minMax: 15 };

export type SeedStep =
	| {
			kind: "window";
			side: "a" | "b";
			start: number;
			W: WindowSize;
			informative: boolean;
	  }
	| { kind: "index"; key: string; start: number; W: WindowSize }
	| {
			kind: "lookup";
			/** start in b */
			start: number;
			key: string;
			/** starts in a sharing this window */
			hits: number[];
			W: WindowSize;
	  }
	| {
			kind: "extend";
			i: number;
			j: number;
			dir: "left" | "right";
			/** run length so far */
			length: number;
			W: WindowSize;
	  }
	| { kind: "run"; len: number; i: number; j: number; W: WindowSize };

export interface SeedTraceResult {
	steps: SeedStep[];
	/** forward-coordinate spans [len, startA, startB], sorted as pairRun's */
	spans: [number, number, number][];
}

const STRIDE = 1 << 16;

function windowSizes(opts: SeedOptions): WindowSize[] {
	return opts.W === "5+4" ? [5, 4] : [opts.W];
}

function informativeFor(w: WindowSize) {
	return w === 5 ? informative5 : informative4;
}

function windowKey(s: ArrayLike<number>, i: number, w: number): string {
	let k = String(s[i]);
	for (let q = i + 1; q < i + w; q++) k += `,${s[q]}`;
	return k;
}

function reversedOf(s: ArrayLike<number>): Float64Array {
	const n = s.length;
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) out[i] = s[n - 1 - i];
	return out;
}

/** Cells where A[i] === B[j] and the value is nonzero — the dot-plot idiom. */
export function dotPlot(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
): [number, number][] {
	const byValue = new Map<number, number[]>();
	for (let i = 0; i < a.length; i++) {
		const v = a[i];
		if (!v) continue;
		const l = byValue.get(v);
		if (l) l.push(i);
		else byValue.set(v, [i]);
	}
	const out: [number, number][] = [];
	for (let j = 0; j < b.length; j++) {
		const v = b[j];
		if (!v) continue;
		const is = byValue.get(v);
		if (!is) continue;
		for (const i of is) out.push([i, j]);
	}
	return out;
}

/**
 * Seed-and-extend between two sequences, one orientation, fully instrumented.
 * `spans` (in forward coordinates) equals `pairRun(a, b, opts)`'s `fwd`
 * orientation when `reverseB` is false, and its `rev` orientation when true —
 * `pairRun` itself picks whichever orientation is longer; this function
 * always runs the one asked for.
 */
export function seedTrace(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	opts: SeedOptions = DEFAULT_SEED_OPTIONS,
): SeedTraceResult {
	const sa = a;
	const sb = opts.reverseB ? reversedOf(b) : b;
	const steps: SeedStep[] = [];
	const runs = new Map<number, number>();

	for (const W of windowSizes(opts)) {
		const inf = informativeFor(W);
		const index = new Map<string, number[]>();
		for (let i = 0; i + W <= sa.length; i++) {
			const ok = inf(sa, i, opts.minMax);
			steps.push({ kind: "window", side: "a", start: i, W, informative: ok });
			if (!ok) continue;
			const key = windowKey(sa, i, W);
			const list = index.get(key);
			if (list) list.push(i);
			else index.set(key, [i]);
			steps.push({ kind: "index", key, start: i, W });
		}
		for (let j = 0; j + W <= sb.length; j++) {
			const ok = inf(sb, j, opts.minMax);
			steps.push({ kind: "window", side: "b", start: j, W, informative: ok });
			if (!ok) continue;
			const key = windowKey(sb, j, W);
			const hits = index.get(key);
			if (!hits) continue;
			steps.push({ kind: "lookup", start: j, key, hits: hits.slice(), W });
			for (const i of hits) {
				let lo = i;
				let hi = j;
				while (lo > 0 && hi > 0 && sa[lo - 1] === sb[hi - 1]) {
					lo--;
					hi--;
					steps.push({
						kind: "extend",
						i: lo,
						j: hi,
						dir: "left",
						length: i + W - lo,
						W,
					});
				}
				let e = W;
				while (
					i + e < sa.length &&
					j + e < sb.length &&
					sa[i + e] === sb[j + e]
				) {
					e++;
					steps.push({
						kind: "extend",
						i: lo,
						j: hi,
						dir: "right",
						length: i + e - lo,
						W,
					});
				}
				const len = i + e - lo;
				steps.push({ kind: "run", len, i: lo, j: hi, W });
				const runKey = lo * STRIDE + hi;
				const had = runs.get(runKey);
				if (had === undefined || len > had) runs.set(runKey, len);
			}
		}
	}

	const m = b.length;
	const spans: [number, number, number][] = [];
	for (const [key, len] of runs) {
		const si = Math.floor(key / STRIDE);
		const sj = key % STRIDE;
		spans.push([len, si, opts.reverseB ? m - sj - len : sj]);
	}
	spans.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2]);
	return { steps, spans };
}
