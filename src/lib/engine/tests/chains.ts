/**
 * Totals → heads chains: the group totals of one khipu found, in order,
 * among the pendant values of another. A port of scripts/deep/arith_chain.py
 * restricted to one ordered pair. Node-importable.
 *
 * - Totals: the pendant groups of the totals khipu (P clusters, group order)
 *   with >= 2 nonzero pendants and a total >= gmin. A total that is also a
 *   plain value on the totals khipu is skipped.
 * - Each total is matched to every pendant of the heads khipu with value >=
 *   gmin equal to it, or (slip) one decimal digit apart (arith_chain
 *   `variants`, totals.ts `oneDigitApart`).
 * - Statistic: the longest chain of matched groups whose heads positions
 *   strictly increase with the group (patience sorting as arith_chain.lis);
 *   the reversed order is scored too and the longer kept (forward on a tie).
 * - Null "both" (default, arith_chain.py's null): the pendant values of
 *   both khipus permuted, and the totals recomputed from the permuted totals
 *   khipu, so the totals are redrawn from its own values. This asks whether
 *   the coincidences happen at all, which is the claim's evidence.
 * - Nulls "values" / "within" (order only): the heads khipu's pendant values
 *   permuted (whole khipu, or within groups) with the totals khipu held
 *   fixed. Every matching value survives the shuffle, so these test only
 *   whether the matches keep their order.
 * - detail.onHeads: matches that land on the first pendant of a group of the
 *   heads khipu (reported, not scored).
 *
 * Rule differences: the Python "plain value" set covers cords at every
 * level; corpus-lite holds level-1 cords and their direct subsidiaries only,
 * so values on deeper subsidiaries are not in the set. Heads positions are
 * level-1 indices (pL1), which order pendants exactly as arith_chain's
 * ordinal order does.
 */
import type {
	CorpusLite,
	Executor,
	KhipuLite,
	Observation,
	Rng,
	Spec,
} from "../../next/types.ts";
import { drawNull } from "../nulls.ts";

export interface ChainLink {
	/** cluster ordinal (0-based) of the group on the totals khipu */
	group: number;
	total: number;
	/** level-1 index of the matched pendant on the heads khipu */
	at: number;
	value: number;
	exact: boolean;
}

function need(c: CorpusLite, id: string): KhipuLite {
	const k = c.byId.get(id);
	if (!k) throw new Error(`no khipu ${id} in the corpus`);
	return k;
}

/** every value one decimal digit away (no leading zero), as arith_chain.variants */
export function variants(v: number): number[] {
	const s = String(v);
	const out: number[] = [];
	for (let i = 0; i < s.length; i++) {
		for (let d = 0; d <= 9; d++) {
			const ch = String(d);
			if (ch === s[i] || (i === 0 && d === 0)) continue;
			out.push(Number(s.slice(0, i) + ch + s.slice(i + 1)));
		}
	}
	return out;
}

interface TotalGroup {
	group: number;
	total: number;
	/** level-1 index of the group's first pendant */
	first: number;
}

/** the totals khipu's qualifying group totals, in group order */
export function groupTotalsOf(k: KhipuLite, gmin: number): TotalGroup[] {
	const plain = new Set<number>();
	for (let i = 0; i < k.seq.length; i++) plain.add(Math.trunc(k.seq[i]));
	for (const vs of k.subs.values()) for (const v of vs) plain.add(v);
	const out: TotalGroup[] = [];
	let g = 0;
	for (const cl of k.clusters) {
		if (cl.k !== "P") continue;
		let total = 0;
		let nz = 0;
		for (let s = cl.start; s < cl.start + cl.size; s++) {
			total += k.pv[s];
			if (k.pv[s] !== 0) nz++;
		}
		if (total >= gmin && nz >= 2 && !plain.has(total))
			out.push({ group: g, total, first: k.pL1[cl.start] });
		g++;
	}
	return out;
}

/** longest chain with group increasing and position strictly increasing */
function lis(pos: [number, number, number][]): [number, number, number][] {
	// [group, position, payload]; equal groups by position descending
	const p = pos.slice().sort((x, y) => x[0] - y[0] || y[1] - x[1]);
	const tails: number[] = [];
	const tailsI: number[] = [];
	const prev = new Array<number>(p.length).fill(-1);
	for (let i = 0; i < p.length; i++) {
		const a = p[i][1];
		let lo = 0;
		let hi = tails.length;
		while (lo < hi) {
			const m = (lo + hi) >> 1;
			if (tails[m] < a) lo = m + 1;
			else hi = m;
		}
		if (lo === tails.length) {
			tails.push(a);
			tailsI.push(i);
		} else {
			tails[lo] = a;
			tailsI[lo] = i;
		}
		prev[i] = lo ? tailsI[lo - 1] : -1;
	}
	const out: [number, number, number][] = [];
	let i = tailsI.length ? tailsI[tailsI.length - 1] : -1;
	while (i >= 0) {
		out.push(p[i]);
		i = prev[i];
	}
	return out.reverse();
}

/**
 * The chain from `totals` onto heads values `pv` at level-1 positions `pL1`.
 */
export function chainOf(
	totals: TotalGroup[],
	pv: ArrayLike<number>,
	pL1: ArrayLike<number>,
	gmin: number,
	slip: boolean,
): { links: ChainLink[]; dir: "fwd" | "rev" } {
	const where = new Map<number, number[]>();
	for (let s = 0; s < pv.length; s++) {
		const v = pv[s];
		if (v < gmin) continue;
		const l = where.get(v);
		if (l) l.push(s);
		else where.set(v, [s]);
	}
	// hits: [group index into totals, position, slot * 2 + exact]
	const hits: [number, number, number][] = [];
	for (let t = 0; t < totals.length; t++) {
		const tot = totals[t].total;
		for (const s of where.get(tot) ?? []) hits.push([t, pL1[s], s * 2 + 1]);
		if (slip)
			for (const w of variants(tot))
				for (const s of where.get(w) ?? []) hits.push([t, pL1[s], s * 2]);
	}
	const fw = lis(hits);
	const rv = lis(hits.map(([t, at, x]) => [t, -at, x]));
	const dir = fw.length >= rv.length ? "fwd" : "rev";
	const best = dir === "fwd" ? fw : rv;
	return {
		dir,
		links: best.map(([t, , x]) => {
			const s = x >> 1;
			return {
				group: totals[t].group,
				total: totals[t].total,
				at: pL1[s],
				value: pv[s],
				exact: (x & 1) === 1,
			};
		}),
	};
}

function gminOf(spec: Spec): number {
	return typeof spec.gmin === "number" ? spec.gmin : 100;
}

/**
 * `totals` group totals heading `heads` groups: longest in-order chain,
 * against the heads khipu's values permuted.
 */
export function chainExec(totals: string, heads: string): Executor {
	const memo = new WeakMap<
		CorpusLite,
		{
			T: KhipuLite;
			H: KhipuLite;
			groups: Map<number, TotalGroup[]>;
			scratch: KhipuLite | null;
			scratchT: KhipuLite | null;
			heads: Set<number>;
		}
	>();
	const prep = (c: CorpusLite) => {
		let p = memo.get(c);
		if (!p) {
			p = {
				T: need(c, totals),
				H: need(c, heads),
				groups: new Map(),
				scratch: null,
				scratchT: null,
				heads: new Set(),
			};
			const H = p.H;
			for (const cl of H.clusters)
				if (cl.k === "P" && cl.size > 0) p.heads.add(H.pL1[cl.start]);
			memo.set(c, p);
		}
		return p;
	};
	const totalsFor = (p: ReturnType<typeof prep>, gmin: number) => {
		let g = p.groups.get(gmin);
		if (!g) {
			g = groupTotalsOf(p.T, gmin);
			p.groups.set(gmin, g);
		}
		return g;
	};
	return {
		scope: "pair",
		nullKind: "replicate",
		observe(c: CorpusLite, spec: Spec): Observation {
			const p = prep(c);
			const gmin = gminOf(spec);
			const tg = totalsFor(p, gmin);
			const { links, dir } = chainOf(
				tg,
				p.H.pv,
				p.H.pL1,
				gmin,
				spec.slip === true,
			);
			const exact = links.filter((l) => l.exact).length;
			const onHeads = links.filter((l) => p.heads.has(l.at)).length;
			const firstOf = new Map(tg.map((g) => [g.group, g.first]));
			return {
				value: links.length,
				hits: [
					{
						ids: [totals, heads],
						at: [
							links.map((l) => firstOf.get(l.group) ?? -1),
							links.map((l) => l.at),
						],
						value: links.length,
						label: links
							.map(
								(l) =>
									`g${l.group + 1}=${l.total}→#${l.at + 1}${l.exact ? "" : `≈${l.value}`}`,
							)
							.join(" · "),
					},
				],
				detail: { chain: links.length, exact, totals: tg.length, onHeads },
				dir,
			};
		},
		replicate(c: CorpusLite, spec: Spec, rng: Rng): number {
			const p = prep(c);
			const gmin = gminOf(spec);
			const slip = spec.slip === true;
			if (spec.null === "values" || spec.null === "within") {
				const t = drawNull(p.H, spec.null, rng, p.scratch ?? undefined);
				p.scratch = t;
				return chainOf(totalsFor(p, gmin), t.pv, t.pL1, gmin, slip).links
					.length;
			}
			// "both": the totals khipu first, then the heads khipu, from one rng
			const tt = drawNull(p.T, "values", rng, p.scratchT ?? undefined);
			p.scratchT = tt;
			const th = drawNull(p.H, "values", rng, p.scratch ?? undefined);
			p.scratch = th;
			return chainOf(groupTotalsOf(tt, gmin), th.pv, th.pL1, gmin, slip).links
				.length;
		},
	};
}
