/**
 * The exact shared-passage scan: a port of scripts/shared_passages.py as run
 * by scripts/build_links.py (the verified bench port in compute-audit §3A).
 * Node-importable.
 *
 * Windows of five level-1 values (>= 4 nonzero, >= 4 distinct, max >= 15)
 * and of four (all nonzero, all distinct, max >= 15) index the corpus; every
 * shared window is extended left and right to a maximal run. Pairs are
 * scanned forward and with one side reversed; a reversed run is mapped back
 * to forward coordinates (i = n - i - len). Rows follow links.json: a < b by
 * id, one row per (a, b, dir), spans [len, startA, startB] sorted descending.
 *
 * Implementation note: Python rescans the corpus with reversed copies added
 * and keeps the pairs where exactly one side is reversed. Every such run is
 * found twice (X vs Y~ and X~ vs Y, mirror images of one another), so this
 * port pairs only forward windows of the lower id with reversed windows of
 * the higher id, which yields the same set of spans.
 */
import type {
	CorpusLite,
	Executor,
	Hit,
	KhipuLite,
	Observation,
	Rng,
	Spec,
} from "../../next/types.ts";
import { FLAG } from "../../next/types.ts";
import { hasFlag } from "../corpus.ts";
import { shuffleInPlace } from "../rng.ts";

export interface ScanOpts {
	windows: "5+4" | "5";
	minMax: number;
}

export interface ScanPairLite {
	a: string;
	b: string;
	dir: "fwd" | "rev";
	values: number;
	runs: number;
	longest: number;
	spans: [number, number, number][];
}

export const DEFAULT_SCAN: ScanOpts = { windows: "5+4", minMax: 15 };

export function informative5(
	s: ArrayLike<number>,
	i: number,
	minMax: number,
): boolean {
	let nz = 0;
	let max = -Infinity;
	for (let k = i; k < i + 5; k++) {
		const v = s[k];
		if (v) nz++;
		if (v > max) max = v;
	}
	if (nz < 4 || max < minMax) return false;
	let distinct = 0;
	for (let k = i; k < i + 5; k++) {
		let seen = false;
		for (let q = i; q < k; q++)
			if (s[q] === s[k]) {
				seen = true;
				break;
			}
		if (!seen) distinct++;
	}
	return distinct >= 4;
}

export function informative4(
	s: ArrayLike<number>,
	i: number,
	minMax: number,
): boolean {
	let max = -Infinity;
	for (let k = i; k < i + 4; k++) {
		const v = s[k];
		if (!v) return false;
		if (v > max) max = v;
		for (let q = i; q < k; q++) if (s[q] === v) return false;
	}
	return max >= minMax;
}

type Informative = (s: ArrayLike<number>, i: number, minMax: number) => boolean;

function windowsOf(opts: ScanOpts): [number, Informative][] {
	return opts.windows === "5"
		? [[5, informative5]]
		: [
				[5, informative5],
				[4, informative4],
			];
}

function windowKey(s: ArrayLike<number>, i: number, W: number): string {
	let k = String(s[i]);
	for (let q = i + 1; q < i + W; q++) k += `,${s[q]}`;
	return k;
}

function reversed(s: ArrayLike<number>): Float64Array {
	const n = s.length;
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) out[i] = s[n - 1 - i];
	return out;
}

/**
 * Runs keyed by start cell. `out` maps i * STRIDE + j -> run length, in the
 * coordinates of (sa, sb) as given (sb possibly reversed).
 */
const STRIDE = 1 << 16;

function extend(
	sa: ArrayLike<number>,
	sb: ArrayLike<number>,
	ai: number,
	bj: number,
	W: number,
	out: Map<number, number>,
): void {
	let i = ai;
	let j = bj;
	while (i > 0 && j > 0 && sa[i - 1] === sb[j - 1]) {
		i--;
		j--;
	}
	let e = W;
	while (ai + e < sa.length && bj + e < sb.length && sa[ai + e] === sb[bj + e])
		e++;
	const key = i * STRIDE + j;
	const len = ai + e - i;
	const had = out.get(key);
	if (had === undefined || len > had) out.set(key, len);
}

function toSpans(
	runs: Map<number, number>,
	rev: boolean,
	m: number,
): [number, number, number][] {
	const spans: [number, number, number][] = [];
	for (const [key, len] of runs) {
		const i = Math.floor(key / STRIDE);
		const j = key % STRIDE;
		spans.push([len, i, rev ? m - j - len : j]);
	}
	spans.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2]);
	return spans;
}

/** Runs between two sequences in one orientation (b already reversed for rev). */
function pairRuns(
	sa: ArrayLike<number>,
	sb: ArrayLike<number>,
	opts: ScanOpts,
): Map<number, number> {
	const out = new Map<number, number>();
	for (const [W, inf] of windowsOf(opts)) {
		const index = new Map<string, number[]>();
		for (let i = 0; i + W <= sa.length; i++) {
			if (!inf(sa, i, opts.minMax)) continue;
			const k = windowKey(sa, i, W);
			const l = index.get(k);
			if (l) l.push(i);
			else index.set(k, [i]);
		}
		if (index.size === 0) continue;
		for (let j = 0; j + W <= sb.length; j++) {
			if (!inf(sb, j, opts.minMax)) continue;
			const l = index.get(windowKey(sb, j, W));
			if (!l) continue;
			for (const i of l) extend(sa, sb, i, j, W, out);
		}
	}
	return out;
}

/**
 * Exact shared runs between two sequences, forward and with b reversed. The
 * returned direction is the one with the longer run (then more run values,
 * then forward); spans are that direction's, in forward coordinates of a, b.
 */
export function pairRun(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	opts: ScanOpts = DEFAULT_SCAN,
): { longest: number; dir: "fwd" | "rev"; spans: [number, number, number][] } {
	const f = toSpans(pairRuns(a, b, opts), false, b.length);
	const r = toSpans(pairRuns(a, reversed(b), opts), true, b.length);
	const lf = f.length ? f[0][0] : 0;
	const lr = r.length ? r[0][0] : 0;
	const vf = f.reduce((s, x) => s + x[0], 0);
	const vr = r.reduce((s, x) => s + x[0], 0);
	if (lr > lf || (lr === lf && vr > vf))
		return { longest: lr, dir: "rev", spans: r };
	return { longest: lf, dir: "fwd", spans: f };
}

/**
 * The corpus scan behind links.json. Khipus carrying CORD_DATA_ERROR are left
 * out, as in shared_passages.scannable. `seqOf` substitutes a sequence per
 * khipu (the shuffle null).
 */
export function scanCorpus(
	c: CorpusLite,
	opts: ScanOpts = DEFAULT_SCAN,
	seqOf?: (k: KhipuLite) => ArrayLike<number>,
): ScanPairLite[] {
	const ks = c.khipus
		.filter((k) => !hasFlag(k, FLAG.CORD_DATA_ERROR))
		.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
	const fwd = ks.map((k) => (seqOf ? seqOf(k) : k.seq));
	const rev = fwd.map(reversed);
	/** pair (x * N + y, x < y) and dir -> runs */
	const N = ks.length;
	const fRuns = new Map<number, Map<number, number>>();
	const rRuns = new Map<number, Map<number, number>>();
	const runsFor = (m: Map<number, Map<number, number>>, key: number) => {
		let r = m.get(key);
		if (!r) {
			r = new Map();
			m.set(key, r);
		}
		return r;
	};
	for (const [W, inf] of windowsOf(opts)) {
		// window key -> occurrences, forward: [khipu, pos, ...]; reversed likewise
		const fIdx = new Map<string, number[]>();
		const rIdx = new Map<string, number[]>();
		for (let x = 0; x < N; x++) {
			const s = fwd[x];
			const t = rev[x];
			for (let i = 0; i + W <= s.length; i++) {
				if (inf(s, i, opts.minMax)) {
					const k = windowKey(s, i, W);
					const l = fIdx.get(k);
					if (l) l.push(x, i);
					else fIdx.set(k, [x, i]);
				}
				if (inf(t, i, opts.minMax)) {
					const k = windowKey(t, i, W);
					const l = rIdx.get(k);
					if (l) l.push(x, i);
					else rIdx.set(k, [x, i]);
				}
			}
		}
		for (const [k, occ] of fIdx) {
			// forward: every pair of occurrences in different khipus, lower first
			if (occ.length >= 4) {
				for (let p = 0; p < occ.length; p += 2) {
					for (let q = 0; q < occ.length; q += 2) {
						const x = occ[p];
						const y = occ[q];
						if (x >= y) continue;
						extend(
							fwd[x],
							fwd[y],
							occ[p + 1],
							occ[q + 1],
							W,
							runsFor(fRuns, x * N + y),
						);
					}
				}
			}
			// reversed: forward window of the lower id, reversed window of the higher
			const rocc = rIdx.get(k);
			if (!rocc) continue;
			for (let p = 0; p < occ.length; p += 2) {
				for (let q = 0; q < rocc.length; q += 2) {
					const x = occ[p];
					const y = rocc[q];
					if (x >= y) continue;
					extend(
						fwd[x],
						rev[y],
						occ[p + 1],
						rocc[q + 1],
						W,
						runsFor(rRuns, x * N + y),
					);
				}
			}
		}
	}
	const rows: ScanPairLite[] = [];
	const emit = (m: Map<number, Map<number, number>>, dir: "fwd" | "rev") => {
		for (const [key, runs] of m) {
			const x = Math.floor(key / N);
			const y = key % N;
			const spans = toSpans(runs, dir === "rev", fwd[y].length);
			rows.push({
				a: ks[x].id,
				b: ks[y].id,
				dir,
				values: spans.reduce((s, r) => s + r[0], 0),
				runs: spans.length,
				longest: spans[0][0],
				spans,
			});
		}
	};
	emit(fRuns, "fwd");
	emit(rRuns, "rev");
	rows.sort(
		(p, q) =>
			q.values - p.values ||
			(p.a < q.a ? -1 : p.a > q.a ? 1 : 0) ||
			(p.b < q.b ? -1 : p.b > q.b ? 1 : 0) ||
			(p.dir < q.dir ? -1 : p.dir > q.dir ? 1 : 0),
	);
	return rows;
}

/** longest run per pair over both directions (build_links.longest_by_pair) */
export function longestByPair(rows: ScanPairLite[]): Map<string, number> {
	const best = new Map<string, number>();
	for (const r of rows) {
		const k = `${r.a}|${r.b}`;
		best.set(k, Math.max(best.get(k) ?? 0, r.longest));
	}
	return best;
}

function scanOpts(spec: Spec): ScanOpts {
	return {
		windows: spec.windows === "5" ? "5" : "5+4",
		minMax: typeof spec.minMax === "number" ? spec.minMax : 15,
	};
}

function inClass(longest: number, spec: Spec): boolean {
	switch (spec.cls) {
		case "5":
			return longest === 5;
		case "4":
			return longest === 4;
		case "atLeast":
			return longest >= (typeof spec.atLeast === "number" ? spec.atLeast : 6);
		default:
			return longest >= 6;
	}
}

function countClass(rows: ScanPairLite[], spec: Spec): number {
	let n = 0;
	for (const v of longestByPair(rows).values()) if (inClass(v, spec)) n++;
	return n;
}

/**
 * The scan's noise floor: pairs whose longest shared run falls in a class,
 * against the same scan over a corpus with every level-1 sequence shuffled.
 * Hits are pairs (ids [a, b], value = longest run), not khipus.
 */
export const scanFloorExec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe(c: CorpusLite, spec: Spec): Observation {
		const rows = scanCorpus(c, scanOpts(spec));
		const best = longestByPair(rows);
		const detail: Record<string, number> = {
			pairs: best.size,
			"6+": 0,
			"5": 0,
			"4": 0,
		};
		for (const v of best.values()) {
			if (v >= 6) detail["6+"]++;
			else if (v === 5) detail["5"]++;
			else if (v === 4) detail["4"]++;
		}
		const hits: Hit[] = [];
		let value = 0;
		for (const r of rows) {
			const longest = best.get(`${r.a}|${r.b}`) ?? 0;
			if (r.longest !== longest || !inClass(longest, spec)) continue;
			// one hit per pair: the direction holding its longest run
			if (hits.some((h) => h.ids[0] === r.a && h.ids[1] === r.b)) continue;
			value++;
			hits.push({
				ids: [r.a, r.b],
				at: [
					r.spans.flatMap(([len, i]) => range(i, len)),
					r.spans.flatMap(([len, , j]) => range(j, len)),
				],
				value: longest,
				label: `${r.a}–${r.b} ${r.dir}, longest ${longest}`,
			});
		}
		return { value, hits, detail };
	},
	replicate(c: CorpusLite, spec: Spec, rng: Rng): number {
		const shuffled: Float64Array[] = new Array(c.khipus.length);
		for (const k of c.khipus) {
			const s = Float64Array.from(k.seq);
			shuffleInPlace(s, rng);
			shuffled[k.index] = s;
		}
		return countClass(
			scanCorpus(c, scanOpts(spec), (k) => shuffled[k.index]),
			spec,
		);
	},
};

function range(from: number, len: number): number[] {
	const out = new Array<number>(len);
	for (let t = 0; t < len; t++) out[t] = from + t;
	return out;
}
