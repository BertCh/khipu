/**
 * Which group does a top cord total? Ported from scripts/deep/tree_topcords.py.
 * Node-importable.
 *
 * Every level-1 top cord T with value > 0, on khipus that have pendants and
 * are decimal-readable (tree_common.load drops NOT_DECIMAL; cord data errors
 * are dropped too, none today), gets a target: the sum of the pendants of its
 * own group ("same"), of group g - 1 ("prev") or of group g + 1 ("next"). T
 * hits when its value equals the target and the target is > 0.
 *
 * Two analytic nulls (spec.null):
 * - "direction" (default): does the target group win over the other groups a
 *   top cord could total? Every top cord that hits exactly one of the
 *   compared groups is, under chance, equally likely to hit any of them: for
 *   "prev" and "next" the two neighbours (a sign test, p = 1/2); for "same"
 *   its own group and both neighbours (p = 1/3). Cords that hit the target
 *   and another compared group count for the target and carry no weight.
 *   This is the claim's contrast: before, not after.
 * - "pooled" (the Python's p_hit): T's value replaced by a draw from the
 *   pooled top-cord values of the other khipus, so expected hits = Σ P(draw
 *   ∈ targets) and sd = sqrt(Σ p(1 - p)). Every target beats this null by
 *   many sd, so it shows only that top cords total some neighbouring group.
 *
 * slip = true (an engine extension, not a number the Python prints as one
 * statistic): T also hits on a near miss by the Python's near-miss rule (both
 * >= 20, off by 1 or in one digit, and less than half apart), with the same
 * rule applied to the null draw. The Python lists near misses only for top
 * cords that no rule hits exactly, so its "42 near misses" is not this count.
 */
import type { CorpusLite, Executor, Hit, Spec } from "../../next/types.ts";
import { isArithmetic } from "../corpus.ts";
import { specBool, specStr } from "./sums.ts";

interface Top {
	kid: string;
	/** khipu index in the corpus */
	k: number;
	/** level-1 index */
	i: number;
	v: number;
	same: number;
	prev: number;
	next: number;
}

const topsMemo = new WeakMap<CorpusLite, Top[]>();

function tops(c: CorpusLite): Top[] {
	let out = topsMemo.get(c);
	if (out) return out;
	out = [];
	for (const k of c.khipus) {
		if (!isArithmetic(k) || k.pv.length === 0) continue;
		const byGroup = new Map<number, number>();
		for (let s = 0; s < k.pv.length; s++) {
			const g = k.grp[k.pL1[s]];
			byGroup.set(g, (byGroup.get(g) ?? 0) + k.pv[s]);
		}
		for (let i = 0; i < k.seq.length; i++) {
			if (k.kind[i] !== 1) continue;
			const v = Math.trunc(k.seq[i]);
			if (v <= 0) continue;
			const g = k.grp[i];
			out.push({
				kid: k.id,
				k: k.index,
				i,
				v,
				same: byGroup.get(g) ?? 0,
				prev: byGroup.get(g - 1) ?? 0,
				next: byGroup.get(g + 1) ?? 0,
			});
		}
	}
	topsMemo.set(c, out);
	return out;
}

/** tree_topcords.slip: same width after zero-padding, exactly one digit differs */
function digitSlip(a: number, b: number): boolean {
	let sa = String(a);
	let sb = String(b);
	const n = Math.max(sa.length, sb.length);
	sa = sa.padStart(n, "0");
	sb = sb.padStart(n, "0");
	let d = 0;
	for (let i = 0; i < n; i++) if (sa[i] !== sb[i]) d++;
	return d === 1;
}

function near(x: number, v: number): boolean {
	return (
		x >= 20 &&
		v >= 20 &&
		(Math.abs(x - v) === 1 || digitSlip(x, v)) &&
		Math.abs(x - v) < 0.5 * Math.max(x, v)
	);
}

type Target = "prev" | "next" | "same";

function params(spec: Spec) {
	const t = specStr(spec, "target", "prev");
	const target: Target = t === "next" ? "next" : t === "same" ? "same" : "prev";
	const nullModel = specStr(spec, "null", "direction");
	return {
		target,
		slip: specBool(spec, "slip", false),
		pooled: nullModel === "pooled",
	};
}

/** the groups a target is compared with under the direction null */
const RIVALS: Record<Target, Target[]> = {
	prev: ["next"],
	next: ["prev"],
	same: ["prev", "next"],
};

/** the direction null: hits split evenly among the compared groups */
function directionNull(
	ts: Top[],
	target: Target,
	slip: boolean,
): { mean: number; sd: number } {
	const rivals = RIVALS[target];
	const share = 1 / (rivals.length + 1);
	let fixed = 0; // hit the target and a rival: counted, no weight
	let n = 0; // hit exactly one compared group
	for (const t of ts) {
		const onTarget = isHit(t[target], t.v, slip);
		const onRivals = rivals.filter((r) => isHit(t[r], t.v, slip)).length;
		if (onTarget && onRivals > 0) fixed++;
		else if (onTarget || onRivals === 1) n++;
	}
	return {
		mean: fixed + n * share,
		sd: Math.sqrt(n * share * (1 - share)),
	};
}

function isHit(x: number, v: number, slip: boolean): boolean {
	if (x <= 0) return false;
	return v === x || (slip && near(x, v));
}

/** a top cord equal to the total of the group before it (or after it / its own) */
export const topCordExec: Executor = {
	scope: "corpus",
	nullKind: "analytic",
	observe(c, spec) {
		const { target, slip } = params(spec);
		const ts = tops(c);
		const byK = new Map<string, number[]>();
		let total = 0;
		let exact = 0;
		for (const t of ts) {
			const x = t[target];
			if (!isHit(x, t.v, slip)) continue;
			total++;
			if (t.v === x) exact++;
			const a = byK.get(t.kid);
			if (a) a.push(t.i);
			else byK.set(t.kid, [t.i]);
		}
		const hits: Hit[] = [...byK].map(([id, at]) => ({
			ids: [id],
			at: [at],
			value: at.length,
		}));
		return {
			value: total,
			hits,
			detail: {
				prev: ts.filter((t) => isHit(t.prev, t.v, slip)).length,
				next: ts.filter((t) => isHit(t.next, t.v, slip)).length,
				same: ts.filter((t) => isHit(t.same, t.v, slip)).length,
				topCords: ts.length,
				khipus: new Set(ts.map((t) => t.kid)).size,
				exact,
				hitKhipus: byK.size,
			},
		};
	},
	analytic(c, spec) {
		const { target, slip, pooled } = params(spec);
		const ts = tops(c);
		if (!pooled) return directionNull(ts, target, slip);
		// pooled values, and each khipu's own count per value (to leave it out)
		const all = new Map<number, number>();
		const own = new Map<number, Map<number, number>>();
		for (const t of ts) {
			all.set(t.v, (all.get(t.v) ?? 0) + 1);
			let m = own.get(t.k);
			if (!m) {
				m = new Map();
				own.set(t.k, m);
			}
			m.set(t.v, (m.get(t.v) ?? 0) + 1);
		}
		const values = [...all.keys()];
		const ownN = new Map<number, number>();
		for (const t of ts) ownN.set(t.k, (ownN.get(t.k) ?? 0) + 1);
		let mean = 0;
		let v2 = 0;
		for (const t of ts) {
			const x = t[target];
			const m = own.get(t.k) as Map<number, number>;
			const n = ts.length - (ownN.get(t.k) ?? 0);
			let p = 0;
			if (n > 0 && x > 0) {
				let hit = 0;
				if (slip) {
					for (const v of values)
						if (isHit(x, v, true)) hit += (all.get(v) ?? 0) - (m.get(v) ?? 0);
				} else {
					hit = (all.get(x) ?? 0) - (m.get(x) ?? 0);
				}
				p = hit / n;
			}
			mean += p;
			v2 += p * (1 - p);
		}
		return { mean, sd: Math.sqrt(v2) };
	},
};
