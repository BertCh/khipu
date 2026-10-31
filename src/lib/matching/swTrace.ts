/**
 * Smith–Waterman–Gotoh local alignment with full matrices and traceback, for
 * small sequences (roughly n, m <= 200 — it allocates three (n+1)×(m+1)
 * Float64Arrays and recomputes the substitution score per cell rather than
 * encoding an alphabet table, which src/lib/engine/tests/align.ts's `swBest`
 * does for speed at corpus scale).
 *
 * `isSlip` is imported directly from align.ts. The substitution rule is
 * `subScoreP`, a parameterised copy of align.ts's `subScore` — the formula is
 * identical, but every constant (OFF, MINM, SLIPW, MIS, ZMIS, GO, GE) is a
 * field of `params` instead of a module constant, so a live slider can change
 * it and re-run. `DEFAULT_SW_PARAMS` holds exactly align.ts's constants, so
 * `swTrace(a, b, ic).best.score` equals `swBest(a, b, ic).score` whenever
 * forward is the winning orientation (checked in
 * scripts/matching/check_traces.mts on KH0303/KH0304).
 *
 * The recursion (H/E/F fill order, tie-breaking) is ported cell-for-cell from
 * align.ts's `swEncoded`, just written against full matrices instead of
 * reused scratch rows, so every intermediate cell can be read back for the
 * DP-grid figure and any cell can be the start of a traceback.
 */
import {
	GE,
	GO,
	isSlip,
	MINM,
	MIS,
	OFF,
	SLIPW,
	ZMIS,
} from "../engine/tests/align.ts";

export interface SwParams {
	go: number;
	ge: number;
	slipw: number;
	mis: number;
	zmis: number;
	off: number;
	minm: number;
}

export const DEFAULT_SW_PARAMS: SwParams = {
	go: GO,
	ge: GE,
	slipw: SLIPW,
	mis: MIS,
	zmis: ZMIS,
	off: OFF,
	minm: MINM,
};

/** Parameterised copy of align.ts's `subScore`; identical at the defaults. */
export function subScoreP(
	a: number,
	b: number,
	ic: (v: number) => number,
	p: SwParams,
): number {
	if (a === b) return a === 0 ? 0 : Math.max(p.minm, ic(a) - p.off);
	if (a === 0 || b === 0) return p.zmis;
	if (isSlip(a, b))
		return Math.max(p.mis, p.slipw * 0.5 * (ic(a) + ic(b)) - p.off);
	return p.mis;
}

/**
 * One column of a printed alignment. 'gapA' is a gap in sequence A opposite
 * `b[j - 1]` (a horizontal step, from the F recursion); 'gapB' is a gap in B
 * opposite `a[i - 1]` (a vertical step, from the E recursion). `i`/`j` are
 * the *destination* cell of the step (1-based, matrix coordinates).
 */
export interface SwStep {
	i: number;
	j: number;
	op: "match" | "slip" | "mismatch" | "gapA" | "gapB";
}

export interface SwTraceResult {
	/** truncated, possibly-reversed values actually aligned (see `reverseB`) */
	a: number[];
	b: number[];
	n: number;
	m: number;
	/** whether `b` was reversed before alignment; map a tb-index back with `m0 - 1 - j` where m0 = original b.length */
	reverseB: boolean;
	/** (n+1)*(m+1) row-major, index i*(m+1)+j */
	H: Float64Array;
	E: Float64Array;
	F: Float64Array;
	best: { score: number; i: number; j: number };
	/** traceback from `best`, in forward (increasing i) order */
	path: SwStep[];
	/** linear (i*(m+1)+j) cell indices in the order they were filled (row-major) */
	order: number[];
	params: SwParams;
}

function reversedInts(a: ArrayLike<number>): number[] {
	const out: number[] = new Array(a.length);
	for (let i = 0; i < a.length; i++) out[i] = a[a.length - 1 - i];
	return out;
}

/**
 * Full Gotoh grid. Ported 1:1 from align.ts's `swEncoded`: at row i, `up` /
 * `diag` / `Hleft` there are exactly `H[i-1][j]`, `H[i-1][j-1]` and
 * `H[i][j-1]` here.
 */
function fill(
	a: number[],
	b: number[],
	ic: (v: number) => number,
	p: SwParams,
): {
	H: Float64Array;
	E: Float64Array;
	F: Float64Array;
	best: { score: number; i: number; j: number };
	order: number[];
} {
	const n = a.length;
	const m = b.length;
	const w = m + 1;
	const H = new Float64Array((n + 1) * w);
	const E = new Float64Array((n + 1) * w);
	const F = new Float64Array((n + 1) * w);
	const idx = (i: number, j: number) => i * w + j;
	for (let j = 0; j <= m; j++) E[idx(0, j)] = -1e18;
	for (let i = 0; i <= n; i++) F[idx(i, 0)] = -1e18;
	let best = 0;
	let bi = 0;
	let bj = 0;
	const order: number[] = [];
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const e = Math.max(E[idx(i - 1, j)] - p.ge, H[idx(i - 1, j)] - p.go);
			E[idx(i, j)] = e;
			const f = Math.max(F[idx(i, j - 1)] - p.ge, H[idx(i, j - 1)] - p.go);
			F[idx(i, j)] = f;
			let h = H[idx(i - 1, j - 1)] + subScoreP(a[i - 1], b[j - 1], ic, p);
			if (e > h) h = e;
			if (f > h) h = f;
			if (h < 0) h = 0;
			H[idx(i, j)] = h;
			order.push(idx(i, j));
			if (h > best) {
				best = h;
				bi = i;
				bj = j;
			}
		}
	}
	return { H, E, F, best: { score: best, i: bi, j: bj }, order };
}

/**
 * Walk a traceback from (i, j) back to a 0 cell. Gotoh traceback needs to
 * remember which matrix it is in: a gap step taken from E (or F) continues
 * in E (F) when the gap was extended, and returns to H only where it was
 * opened. Ties are broken as the fill does (diagonal, then E, then F; a gap
 * is closed as soon as opening it explains the score).
 */
function walkBack(
	a: number[],
	b: number[],
	ic: (v: number) => number,
	p: SwParams,
	H: Float64Array,
	E: Float64Array,
	F: Float64Array,
	m: number,
	startI: number,
	startJ: number,
): SwStep[] {
	const w = m + 1;
	const idx = (i: number, j: number) => i * w + j;
	const path: SwStep[] = [];
	let i = startI;
	let j = startJ;
	let state: "H" | "E" | "F" = "H";
	while (i > 0 && j > 0) {
		if (state === "H") {
			const h = H[idx(i, j)];
			if (h <= 0) break;
			const diag = H[idx(i - 1, j - 1)] + subScoreP(a[i - 1], b[j - 1], ic, p);
			if (diag === h) {
				const av = a[i - 1];
				const bv = b[j - 1];
				const op: SwStep["op"] =
					av === bv ? "match" : isSlip(av, bv) ? "slip" : "mismatch";
				path.push({ i, j, op });
				i--;
				j--;
			} else if (E[idx(i, j)] === h) state = "E";
			else if (F[idx(i, j)] === h) state = "F";
			else
				throw new Error(
					`swTrace: cell (${i}, ${j}) matches neither diag, E nor F`,
				);
		} else if (state === "E") {
			// a[i-1] against a gap; was this gap opened here or extended?
			path.push({ i, j, op: "gapB" });
			if (E[idx(i, j)] !== H[idx(i - 1, j)] - p.go) state = "E";
			else state = "H";
			i--;
		} else {
			path.push({ i, j, op: "gapA" });
			if (F[idx(i, j)] !== H[idx(i, j - 1)] - p.go) state = "F";
			else state = "H";
			j--;
		}
	}
	path.reverse();
	return path;
}

/**
 * Full alignment grid and the optimal traceback. `opts.reverseB` aligns
 * against b reversed (matching align.ts's `rev` orientation); pass a
 * `Partial<SwParams>` to override any scoring constant for a live slider.
 */
export function swTrace(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	ic: (v: number) => number,
	opts: Partial<SwParams> & { reverseB?: boolean } = {},
): SwTraceResult {
	const { reverseB, ...paramOverrides } = opts;
	const params: SwParams = { ...DEFAULT_SW_PARAMS, ...paramOverrides };
	const ta = Array.from(a, Math.trunc);
	const tb0 = Array.from(b, Math.trunc);
	const tb = reverseB ? reversedInts(tb0) : tb0;
	const { H, E, F, best, order } = fill(ta, tb, ic, params);
	const path = walkBack(ta, tb, ic, params, H, E, F, tb.length, best.i, best.j);
	return {
		a: ta,
		b: tb,
		n: ta.length,
		m: tb.length,
		reverseB: Boolean(reverseB),
		H,
		E,
		F,
		best,
		path,
		order,
		params,
	};
}

/** Traceback ending at an arbitrary cell (e.g. a clicked DP-grid cell), not just the best score's. */
export function traceFrom(
	t: SwTraceResult,
	ic: (v: number) => number,
	i: number,
	j: number,
): SwStep[] {
	return walkBack(t.a, t.b, ic, t.params, t.H, t.E, t.F, t.m, i, j);
}
