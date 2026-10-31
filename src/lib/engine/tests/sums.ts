/**
 * Medrano & Khosla (2024) sum relations on the pendant model, ported from
 * scripts/mk/mk_sig_common.py (rel1, rel2, rel3, rel5, rel9, off_by_one) and
 * counted over the corpus as scripts/build_chance.py does (every khipu with
 * at least 3 pendants; null "a" by default). Node-importable.
 *
 * Relation 1 reuses chance.pendantSums, which is the same search as rel1.
 * r2 / r3 / r5 follow the verified bench port (scratchpad/bench/bench.mjs),
 * which counts exactly what build_profiles.py counts: one hit per sum cord and
 * side whose shortest matching run exists and no matching run is "trivial"
 * (as long as the target).
 *
 * Rule notes:
 * - The pendant model is kind "pendant" only. mk_sig_common takes every
 *   level-1 cord that is not a top cord; the corpus has no level-1 markers, so
 *   the two agree today.
 * - build_chance.py (chance.json: 678 khipus, r1 8648, r1adj 740) does not drop
 *   the NOT_DECIMAL khipus. The spec's subset "arithmetic" does, and gives
 *   r1 8312 and r1adj 718 on the same data; subset "all" reproduces the
 *   recorded numbers. r9 is 101 either way (no NOT_DECIMAL khipu has a lone
 *   top cord hit); r9Exec keeps the "arithmetic" population.
 */
import type {
	CorpusLite,
	Executor,
	Hit,
	KhipuLite,
	NullModel,
	Observation,
	Rng,
	Spec,
	ValueSource,
} from "../../next/types.ts";
import { type PendantSum, pendantSums } from "../../stories/chance.ts";
import { cloneLite, corpusFor, isArithmetic, WARI_IDS } from "../corpus.ts";
import { drawNull } from "../nulls.ts";

/* ─────────── shared helpers (also used by the other P6 test files) ─────────── */

const scratchMemo = new WeakMap<KhipuLite, KhipuLite>();

/** a reusable permutation target for `k` (allocation-free replicates) */
export function scratchFor(k: KhipuLite): KhipuLite {
	let s = scratchMemo.get(k);
	if (!s) {
		s = cloneLite(k);
		scratchMemo.set(k, s);
	}
	return s;
}

export function specStr(spec: Spec, key: string, dflt: string): string {
	const v = spec[key];
	return v === undefined ? dflt : String(v);
}

export function specNum(spec: Spec, key: string, dflt: number): number {
	const v = spec[key];
	return typeof v === "number" ? v : v === undefined ? dflt : Number(v);
}

export function specBool(spec: Spec, key: string, dflt: boolean): boolean {
	const v = spec[key];
	if (v === undefined) return dflt;
	return v === true || v === "true" || v === 1;
}

export function sourceOf(spec: Spec): ValueSource {
	return specStr(spec, "valueSource", "kfg") === "knots" ? "knots" : "kfg";
}

const WARI = new Set(WARI_IDS);

/**
 * "arithmetic": not NOT_DECIMAL and no cord data error; "wari": the nine Wari
 * khipus; "all": every khipu (the population of build_chance.py / chance.json).
 */
export function inSubset(k: KhipuLite, subset: string): boolean {
	if (subset === "all") return true;
	return subset === "wari" ? WARI.has(k.id) : isArithmetic(k);
}

/** Python's round() (half to even) for x = n / 2 */
export function pyRound(x: number): number {
	const f = Math.floor(x);
	const d = x - f;
	if (d > 0.5) return f + 1;
	if (d < 0.5) return f;
	return f % 2 === 0 ? f : f + 1;
}

/* ─────────── relation 1 ─────────── */

function sumsOf(pv: ArrayLike<number>): PendantSum[] {
	return pendantSums(Array.from(pv));
}

/** r1 counts: all sums, those whose run touches the sum cord, and right-handed ones */
export function rel1(pv: ArrayLike<number>): {
	count: number;
	adj: number;
	right: number;
} {
	const s = sumsOf(pv);
	let adj = 0;
	let right = 0;
	for (const x of s) {
		if (x.from === x.at + 1 || x.to === x.at - 1) adj++;
		if (x.right) right++;
	}
	return { count: s.length, adj, right };
}

/* ─────────── run search shared by r2 / r3 / r5 ─────────── */

/**
 * mk_sig_common._shortest_combo, reduced to "found": some contiguous run of
 * the (positive) vals sums to target with minlen <= length <= maxlen, and no
 * such run is kill or longer.
 */
function hasRun(
	vals: number[],
	target: number,
	minlen: number,
	maxlen: number,
	kill: number,
): boolean {
	const m = vals.length;
	if (m < minlen) return false;
	const Q = new Float64Array(m + 1);
	for (let i = 0; i < m; i++) Q[i + 1] = Q[i] + vals[i];
	let found = false;
	for (let s = 0; s < m; s++) {
		const tg = Q[s] + target;
		let lo = s;
		let hi = m + 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (Q[mid] < tg) lo = mid + 1;
			else hi = mid;
		}
		if (lo <= m && Q[lo] === tg) {
			const L = lo - s;
			if (L >= minlen && L <= maxlen) {
				if (L >= kill) return false;
				found = true;
			}
		}
	}
	return found;
}

/** pendant slots per P cluster, in cluster order (the MK `groups`) */
function groupsOf(k: KhipuLite): number[][] {
	const out: number[][] = [];
	for (const cl of k.clusters) {
		if (cl.k !== "P") continue;
		const g: number[] = [];
		for (let j = 0; j < cl.size; j++) g.push(cl.start + j);
		out.push(g);
	}
	return out;
}

/** relation 2: a pendant (> 10) equals a run of >= 3 non-zero same-colour pendants to one side */
export function rel2(k: KhipuLite, pv: ArrayLike<number>): number {
	const bycol = new Map<number, number[]>();
	for (let j = 0; j < k.pCol.length; j++) {
		const c = k.pCol[j];
		const a = bycol.get(c);
		if (a) a.push(j);
		else bycol.set(c, [j]);
	}
	let h = 0;
	for (let i = 0; i < pv.length; i++) {
		const t = pv[i];
		if (t <= 10) continue;
		const same = bycol.get(k.pCol[i]) as number[];
		const pos = same.indexOf(i);
		for (const lst of [same.slice(0, pos), same.slice(pos + 1)]) {
			const vals: number[] = [];
			for (const j of lst) if (pv[j] > 0) vals.push(pv[j]);
			if (vals.length >= 3 && hasRun(vals, t, 3, 249, t)) h++;
		}
	}
	return h;
}

function rel3Valid(t: number): boolean {
	if (t <= 5) return false;
	if (t < 100 && t % 10 === 0) return false;
	return !(t >= 100 && t < 1000 && t % 100 === 0);
}

/** relation 3: a pendant equals a run of the pendants at its slot in the groups to one side */
export function rel3(k: KhipuLite, pv: ArrayLike<number>): number {
	const groups = groupsOf(k);
	let h = 0;
	for (let gi = 0; gi < groups.length; gi++) {
		const g = groups[gi];
		for (let ci = 0; ci < g.length; ci++) {
			const t = pv[g[ci]];
			if (!rel3Valid(t)) continue;
			const L: number[] = [];
			const R: number[] = [];
			for (let x = 0; x < groups.length; x++) {
				if (x === gi || groups[x].length <= ci) continue;
				const v = pv[groups[x][ci]];
				if (v > 0) (x < gi ? L : R).push(v);
			}
			for (const vals of [L, R])
				if (vals.length >= 2 && hasRun(vals, t, 2, 1e9, t)) h++;
		}
	}
	return h;
}

/** relation 5: a subsidiary (> 10) equals a run of >= 3 non-zero pendants to one side of its pendant */
export function rel5(k: KhipuLite, pv: ArrayLike<number>): number {
	const nzi: number[] = [];
	for (let i = 0; i < pv.length; i++) if (pv[i] > 0) nzi.push(i);
	let h = 0;
	for (let i = 0; i < k.pSubs.length; i++) {
		const ss = k.pSubs[i];
		if (!ss || ss.length === 0) continue;
		let left: number[] | null = null;
		let right: number[] | null = null;
		for (const sv of ss) {
			if (sv <= 10 || (sv < 100 && sv % 10 === 0)) continue;
			if (!left) {
				left = [];
				right = [];
				for (const j of nzi) (j <= i ? left : right).push(pv[j]);
			}
			for (const vals of [left, right as number[]])
				if (vals.length >= 3 && hasRun(vals, sv, 3, 249, sv)) h++;
		}
	}
	return h;
}

/* ─────────── relation 9 ─────────── */

/** mk_sig_common.off_by_one: n with one digit moved by at most 1 */
export function offByOne(n: number): Set<number> {
	const s = String(n);
	const r = new Set<number>();
	for (let i = 0; i < s.length; i++) {
		const d = Number(s[i]);
		if (!Number.isInteger(d)) continue;
		for (let x = Math.max(0, d - 1); x <= Math.min(9, d + 1); x++)
			r.add(Number(s.slice(0, i) + String(x) + s.slice(i + 1)));
	}
	return r;
}

interface ClusterSum {
	top: boolean;
	n: number;
	sum: number;
	/** P cluster: its first slot; T cluster: -1 */
	start: number;
}

/** clusters in primary order with (is top, cord count, sum), from `pv` */
export function clusterSums(k: KhipuLite, pv: ArrayLike<number>): ClusterSum[] {
	const out: ClusterSum[] = [];
	for (const cl of k.clusters) {
		if (cl.k === "P") {
			let s = 0;
			for (let j = 0; j < cl.size; j++) s += pv[cl.start + j];
			out.push({ top: false, n: cl.size, sum: s, start: cl.start });
		} else {
			let s = 0;
			for (const v of cl.values) s += v;
			out.push({ top: true, n: cl.values.length, sum: s, start: -1 });
		}
	}
	return out;
}

/** cluster indices of relation-9 hits (a lone top cord that sums or doubles a neighbour) */
function rel9Hits(k: KhipuLite, slip: boolean): number[] {
	const cs = clusterSums(k, k.pv);
	const out: number[] = [];
	for (let i = 0; i < cs.length - 1; i++) {
		const A = cs[i];
		const B = cs[i + 1];
		const ls = A.sum;
		const rs = B.sum;
		if (ls <= 0) continue;
		const hl = pyRound(ls / 2);
		const hr = pyRound(rs / 2);
		let m1: boolean;
		let m2: boolean;
		if (slip) {
			m1 = ls === rs || offByOne(rs).has(ls) || offByOne(ls).has(rs);
			m2 =
				ls === hr || hl === rs || offByOne(rs).has(hl) || offByOne(ls).has(hr);
		} else {
			m1 = ls === rs;
			m2 = ls === hr || hl === rs;
		}
		const tag = A.n === 1 ? i : B.n === 1 ? i + 1 : -1;
		if (tag < 0) continue;
		const T = cs[tag];
		if (T.top && T.sum > 0 && (m1 || m2)) out.push(tag);
	}
	return out;
}

/** relation 9 count on the khipu's current pv / clusters; slip allows one digit off */
export function rel9(k: KhipuLite, slip: boolean): number {
	return rel9Hits(k, slip).length;
}

/* ─────────── executors ─────────── */

type R1Stat = "count" | "adj";

function r1Units(c: CorpusLite, spec: Spec): KhipuLite[] {
	const subset = specStr(spec, "subset", "arithmetic");
	return c.khipus.filter((k) => k.pv.length >= 3 && inSubset(k, subset));
}

function r1Observe(c0: CorpusLite, spec: Spec, stat: R1Stat): Observation {
	const c = corpusFor(c0, sourceOf(spec));
	const hits: Hit[] = [];
	let total = 0;
	let adjT = 0;
	let rightT = 0;
	let allT = 0;
	let khipus = 0;
	for (const k of r1Units(c, spec)) {
		const s = sumsOf(k.pv);
		const at: number[] = [];
		let adj = 0;
		let right = 0;
		for (const x of s) {
			const isAdj = x.from === x.at + 1 || x.to === x.at - 1;
			if (isAdj) adj++;
			if (x.right) right++;
			if (stat === "count" || isAdj) at.push(k.pL1[x.at]);
		}
		const n = stat === "count" ? s.length : adj;
		total += n;
		allT += s.length;
		adjT += adj;
		rightT += right;
		khipus++;
		if (n > 0) hits.push({ ids: [k.id], at: [at], value: n });
	}
	return {
		value: total,
		hits,
		detail: {
			khipus,
			khipusWithHits: hits.length,
			sums: allT,
			adjacent: adjT,
			right: rightT,
			rightShare: allT ? rightT / allT : 0,
		},
	};
}

function nullOf(spec: Spec, allowed: readonly NullModel[]): NullModel {
	const v = specStr(spec, "null", allowed[0]) as NullModel;
	return allowed.includes(v) ? v : allowed[0];
}

const R1_NULLS: readonly NullModel[] = [
	"pendants",
	"values",
	"within",
	"groupOrder",
];

function r1Replicate(c0: CorpusLite, spec: Spec, rng: Rng, stat: R1Stat) {
	const c = corpusFor(c0, sourceOf(spec));
	const model = nullOf(spec, R1_NULLS);
	let total = 0;
	for (const k of r1Units(c, spec)) {
		const t = drawNull(k, model, rng, scratchFor(k));
		const r = rel1(t.pv);
		total += stat === "count" ? r.count : r.adj;
	}
	return total;
}

/** relation 1 over the corpus: pendant equal to a run of neighbouring pendants */
export const r1Exec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe: (c, spec) => r1Observe(c, spec, "count"),
	replicate: (c, spec, rng) => r1Replicate(c, spec, rng, "count"),
};

/** relation-1 sums whose run starts on the cord next to the sum cord */
export const r1adjExec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe: (c, spec) => r1Observe(c, spec, "adj"),
	replicate: (c, spec, rng) => r1Replicate(c, spec, rng, "adj"),
};

const R9_NULLS: readonly NullModel[] = ["pendants", "within"];

function r9Units(c: CorpusLite): KhipuLite[] {
	return c.khipus.filter(
		(k) => k.pv.length >= 3 && isArithmetic(k) && hasLoneTop(k),
	);
}

/** a top-cord-only cluster of one cord exists (else relation 9 cannot fire) */
function hasLoneTop(k: KhipuLite): boolean {
	for (const cl of k.clusters)
		if (cl.k === "T" && cl.values.length === 1) return true;
	return false;
}

/** relation 9: a lone top cord equal to (or double / half of) its neighbouring cluster's total */
export const r9Exec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe(c, spec) {
		const slip = specBool(spec, "slip", true);
		const hits: Hit[] = [];
		let total = 0;
		for (const k of r9Units(c)) {
			const tags = rel9Hits(k, slip);
			if (!tags.length) continue;
			total += tags.length;
			hits.push({
				ids: [k.id],
				at: [tags.map((ti) => topL1(k, ti))],
				value: tags.length,
			});
		}
		return { value: total, hits, detail: { khipus: hits.length } };
	},
	replicate(c, spec, rng) {
		const slip = specBool(spec, "slip", true);
		const model = nullOf(spec, R9_NULLS);
		let total = 0;
		for (const k of r9Units(c)) {
			const t = drawNull(k, model, rng, scratchFor(k));
			total += rel9(t, slip);
		}
		return total;
	},
};

/** level-1 index of the lone top cord of cluster `ci` */
function topL1(k: KhipuLite, ci: number): number {
	// clusters follow ascending grp; the T cluster's cords are the level-1
	// cords of the ci-th distinct group
	const groups = [...new Set(Array.from(k.grp))].sort((a, b) => a - b);
	const g = groups[ci];
	for (let i = 0; i < k.grp.length; i++) if (k.grp[i] === g) return i;
	return -1;
}
