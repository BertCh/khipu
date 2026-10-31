/**
 * Tolerant local alignment of two level-1 value sequences: a port of the
 * scoring in scripts/deep/align_scan.py (Scorer + align_sw.c, Gotoh affine
 * gaps). Node-importable. No traceback in this phase.
 *
 * Substitution, with IC(v) the information content of a value:
 *   v = v (v != 0)   max(MINM, IC(v) - OFF)
 *   0 = 0            0 (blank cords align freely)
 *   0 vs v           ZMIS
 *   slip (isSlip)    max(MIS, SLIPW * mean(IC) - OFF)
 *   otherwise        MIS
 * Gaps: open GO (the first gapped cord costs GO), each further cord GE.
 *
 * Rule difference: the Python IC is -log2((freq + 0.5) / T) over the
 * alignable khipus; here IC comes from `icOf` (the whole corpus, no +0.5),
 * as the contract asks. Scores therefore differ from align_results.json by a
 * few hundredths per cord; the test only compares a pair with its own nulls.
 */

export const OFF = 3.0;
export const MINM = 0.1;
export const SLIPW = 0.5;
export const MIS = -3.0;
export const ZMIS = -1.5;
export const GO = 4.0;
export const GE = 1.0;
export const IC_CAP = 13;

function sortedDigits(s: string): string {
	return s.split("").sort().join("");
}

/**
 * A recording slip between two different positive values: off by one, one
 * digit off by one, ×10, a digit transposition, or one digit dropped.
 */
export function isSlip(a: number, b: number): boolean {
	if (a === b || a <= 0 || b <= 0) return false;
	if (Math.abs(a - b) === 1 || a === 10 * b || b === 10 * a) return true;
	const sa = String(a);
	const sb = String(b);
	if (sa.length === sb.length) {
		let nd = 0;
		let dd = 0;
		for (let i = 0; i < sa.length; i++) {
			if (sa[i] !== sb[i]) {
				nd++;
				dd = Math.abs(sa.charCodeAt(i) - sb.charCodeAt(i));
			}
		}
		if (nd === 1 && dd === 1) return true;
		if (sa.length >= 2 && sortedDigits(sa) === sortedDigits(sb)) return true;
	}
	if (Math.abs(sa.length - sb.length) === 1) {
		const [lo, hi] = sa.length < sb.length ? [sa, sb] : [sb, sa];
		for (let i = 0; i < hi.length; i++) {
			if (hi.slice(0, i) + hi.slice(i + 1) === lo) return true;
		}
	}
	return false;
}

/** substitution score of a against b */
export function subScore(
	a: number,
	b: number,
	ic: (v: number) => number,
): number {
	if (a === b) return a === 0 ? 0 : Math.max(MINM, ic(a) - OFF);
	if (a === 0 || b === 0) return ZMIS;
	if (isSlip(a, b)) return Math.max(MIS, SLIPW * 0.5 * (ic(a) + ic(b)) - OFF);
	return MIS;
}

/**
 * A pair's alphabets and substitution table: rows are the distinct values of
 * A, columns those of B. B may later be replaced by any permutation of itself
 * (same alphabet), which is what the pair nulls do. Float32 like the C kernel.
 */
export interface Encoded {
	rows: Map<number, number>;
	cols: Map<number, number>;
	/** rows.size × cols.size, row-major */
	table: Float32Array;
	Db: number;
}

export function encodePair(
	aValues: Iterable<number>,
	bValues: Iterable<number>,
	ic: (v: number) => number,
): Encoded {
	const ra = [...new Set(aValues)];
	const cb = [...new Set(bValues)];
	const Db = cb.length;
	const table = new Float32Array(ra.length * Db);
	for (let i = 0; i < ra.length; i++)
		for (let j = 0; j < Db; j++) table[i * Db + j] = subScore(ra[i], cb[j], ic);
	return {
		rows: new Map(ra.map((v, i) => [v, i])),
		cols: new Map(cb.map((v, i) => [v, i])),
		table,
		Db,
	};
}

function encodeWith(
	map: Map<number, number>,
	seq: ArrayLike<number>,
): Int32Array {
	const out = new Int32Array(seq.length);
	for (let i = 0; i < seq.length; i++) {
		const k = map.get(seq[i]);
		if (k === undefined) throw new Error(`value ${seq[i]} not in alphabet`);
		out[i] = k;
	}
	return out;
}

export function encodeA(enc: Encoded, seq: ArrayLike<number>): Int32Array {
	return encodeWith(enc.rows, seq);
}

export function encodeB(enc: Encoded, seq: ArrayLike<number>): Int32Array {
	return encodeWith(enc.cols, seq);
}

/** scratch rows reused across calls */
let H = new Float64Array(0);
let E = new Float64Array(0);

/**
 * Smith–Waterman with Gotoh gaps over encoded sequences (align_sw.c sw1).
 * `rev` reads b backwards without copying. Returns the best score and its
 * end cell (1-based in the oriented sequences; 0 when the score is 0).
 */
export function swEncoded(
	a: Int32Array,
	b: Int32Array,
	enc: Encoded,
	rev = false,
): { score: number; i: number; j: number } {
	const n = a.length;
	const m = b.length;
	if (H.length < m + 1) {
		H = new Float64Array(m + 1);
		E = new Float64Array(m + 1);
	}
	for (let j = 0; j <= m; j++) {
		H[j] = 0;
		E[j] = -1e18;
	}
	const { table, Db } = enc;
	let best = 0;
	let bi = 0;
	let bj = 0;
	for (let i = 1; i <= n; i++) {
		const row = a[i - 1] * Db;
		let diag = 0;
		let F = -1e18;
		let Hleft = 0;
		for (let j = 1; j <= m; j++) {
			const up = H[j];
			let e = E[j] - GE;
			let t = up - GO;
			if (t > e) e = t;
			E[j] = e;
			let f = F - GE;
			t = Hleft - GO;
			if (t > f) f = t;
			F = f;
			let h = diag + table[row + b[rev ? m - j : j - 1]];
			if (e > h) h = e;
			if (f > h) h = f;
			if (h < 0) h = 0;
			diag = up;
			H[j] = h;
			Hleft = h;
			if (h > best) {
				best = h;
				bi = i;
				bj = j;
			}
		}
	}
	return { score: best, i: bi, j: bj };
}

/** best of the forward and reversed alignments of encoded a and b */
export function swBestEncoded(
	a: Int32Array,
	b: Int32Array,
	enc: Encoded,
): { score: number; dir: "fwd" | "rev"; endA: number; endB: number } {
	const f = swEncoded(a, b, enc, false);
	const r = swEncoded(a, b, enc, true);
	const m = b.length;
	if (f.score <= 0 && r.score <= 0)
		return { score: 0, dir: "fwd", endA: -1, endB: -1 };
	if (r.score > f.score)
		return { score: r.score, dir: "rev", endA: r.i - 1, endB: m - r.j };
	return { score: f.score, dir: "fwd", endA: f.i - 1, endB: f.j - 1 };
}

/**
 * Best local alignment score of a against b, forward or with b reversed.
 * Values are truncated to integers first. endA / endB are 0-based forward
 * indices of the last aligned cord in a and of its partner in b (-1 when the
 * score is 0).
 */
export function swBest(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	ic: (v: number) => number,
): { score: number; dir: "fwd" | "rev"; endA: number; endB: number } {
	const ta = Array.from(a, Math.trunc);
	const tb = Array.from(b, Math.trunc);
	const enc = encodePair(ta, tb, ic);
	return swBestEncoded(encodeA(enc, ta), encodeB(enc, tb), enc);
}
