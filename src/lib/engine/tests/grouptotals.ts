/**
 * Group totals on the first cord, ported from scripts/deep/tree_grouptotals.py.
 * Node-importable.
 *
 * Groups are runs of consecutive level-1 pendants (ordinal order) sharing a
 * group index, with at least 3 pendants. A group counts at a position when a
 * cord c there has 2c == group total, c >= minCord, and the group has at
 * least 3 non-zero pendants. INTERIOR counts a group only when neither its
 * first nor its last cord qualifies. The Python skips khipus with fewer than 3
 * pendants and the NOT_DECIMAL khipus (tree_common.load); cord data errors are
 * dropped too (none today).
 *
 * Null "values" permutes the pendant values within the khipu (the Python's
 * null); "within" permutes them inside each group. Group sizes and positions
 * are fixed. The Python's Inkawasi split uses a case-sensitive substring test
 * on provenance ("ncahuasi" / "nkawasi"); the engine uses the INKAWASI flag
 * (/incahuasi|inkawasi/i), which marks the same khipus today.
 */
import type {
	CorpusLite,
	Executor,
	Hit,
	KhipuLite,
	NullModel,
	Spec,
} from "../../next/types.ts";
import { FLAG } from "../../next/types.ts";
import { corpusFor, hasFlag, isArithmetic } from "../corpus.ts";
import { drawNull } from "../nulls.ts";
import { scratchFor, sourceOf, specNum, specStr } from "./sums.ts";

type Position = "first" | "last" | "interior";

/** pendant slots (into pv) per qualifying group, in ordinal order within the group */
const groupMemo = new WeakMap<KhipuLite, number[][]>();

function groupsOf(k: KhipuLite): number[][] {
	let out = groupMemo.get(k);
	if (out) return out;
	out = [];
	// pendant slots in level-1 (ordinal) order
	const slots = Array.from({ length: k.pL1.length }, (_, s) => s).sort(
		(a, b) => k.pL1[a] - k.pL1[b],
	);
	let i = 0;
	while (i < slots.length) {
		const g = k.grp[k.pL1[slots[i]]];
		let j = i;
		while (j < slots.length && k.grp[k.pL1[slots[j]]] === g) j++;
		if (j - i >= 3) out.push(slots.slice(i, j));
		i = j;
	}
	groupMemo.set(k, out);
	return out;
}

function units(c: CorpusLite, spec: Spec): KhipuLite[] {
	const exclude = specStr(spec, "exclude", "none");
	return c.khipus.filter(
		(k) =>
			k.pv.length >= 3 &&
			isArithmetic(k) &&
			!(exclude === "inkawasi" && hasFlag(k, FLAG.INKAWASI)) &&
			groupsOf(k).length > 0,
	);
}

/** qualifying groups of `k` at `pos` under values `v`; returns the hitting slots */
function countAt(
	k: KhipuLite,
	v: ArrayLike<number>,
	minCord: number,
	pos: Position,
	at?: number[],
): number {
	let h = 0;
	for (const g of groupsOf(k)) {
		let tot = 0;
		let nz = 0;
		for (const s of g) {
			tot += v[s];
			if (v[s] > 0) nz++;
		}
		if (nz < 3) continue;
		const ok = (s: number) => 2 * v[s] === tot && v[s] >= minCord;
		const f = ok(g[0]);
		const l = ok(g[g.length - 1]);
		let hit = -1;
		if (pos === "first") hit = f ? g[0] : -1;
		else if (pos === "last") hit = l ? g[g.length - 1] : -1;
		else if (!f && !l) {
			for (let x = 1; x < g.length - 1; x++)
				if (ok(g[x])) {
					hit = g[x];
					break;
				}
		}
		if (hit >= 0) {
			h++;
			at?.push(k.pL1[hit]);
		}
	}
	return h;
}

function params(spec: Spec) {
	const p = specStr(spec, "position", "first");
	const position: Position =
		p === "last" ? "last" : p === "interior" ? "interior" : "first";
	const n = specStr(spec, "null", "values");
	const model: NullModel = n === "within" ? "within" : "values";
	return { position, model, minCord: specNum(spec, "minCord", 10) };
}

/** groups whose total sits on their first (or last / an interior) cord */
export const firstCordTotalsExec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe(c0, spec) {
		const c = corpusFor(c0, sourceOf(spec));
		const { position, minCord } = params(spec);
		const hits: Hit[] = [];
		let total = 0;
		let ink = 0;
		let groups = 0;
		const us = units(c, spec);
		for (const k of us) {
			groups += groupsOf(k).length;
			const at: number[] = [];
			const n = countAt(k, k.pv, minCord, position, at);
			if (!n) continue;
			total += n;
			if (hasFlag(k, FLAG.INKAWASI)) ink += n;
			hits.push({ ids: [k.id], at: [at], value: n });
		}
		return {
			value: total,
			hits,
			detail: {
				inkawasi: ink,
				elsewhere: total - ink,
				groups,
				khipus: us.length,
			},
		};
	},
	replicate(c0, spec, rng) {
		const c = corpusFor(c0, sourceOf(spec));
		const { position, model, minCord } = params(spec);
		let total = 0;
		for (const k of units(c, spec)) {
			const t = drawNull(k, model, rng, scratchFor(k));
			total += countAt(k, t.pv, minCord, position);
		}
		return total;
	},
};
