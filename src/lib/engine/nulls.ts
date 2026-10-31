/**
 * Null draws for the /next engine: one shuffled copy of a khipu under a named
 * chance model. Node-importable. Every draw takes its randomness only from
 * the `rng` it is handed, and never mutates the source khipu.
 */
import type { KhipuLite, NullModel, Rng } from "../next/types.ts";
import { cloneLite } from "./corpus.ts";
import { shuffleInPlace } from "./rng.ts";

export const NULL_LABEL: Record<NullModel, string> = {
	sequence: "whole sequence",
	seqWithin: "sequence within groups",
	values: "pendant values",
	pendants: "whole pendants (MK a)",
	within: "pendants within groups (MK c)",
	groupOrder: "group order (MK b)",
};

export const NULL_BLURB: Record<NullModel, string> = {
	sequence:
		"Every level-1 cord value, top cords included, is shuffled along the khipu; the multiset of values is kept.",
	seqWithin:
		"Level-1 cord values are shuffled only within their own group; each group keeps its values and its place.",
	values:
		"Only the pendant values move among pendant slots; colours, subsidiaries, group sizes and top cords stay where they are.",
	pendants:
		"Whole pendants (value, colour and subsidiaries together) move across all slots; group sizes and top cords are kept.",
	within:
		"Whole pendants move only within their own group; every group keeps its size, its members and its place.",
	groupOrder:
		"Whole groups of pendants trade places with each other, contents intact; top-cord clusters stay put.",
};

/** level-1 index blocks per grp value, cached on the (never permuted) grp array */
const seqBlocks = new WeakMap<Int16Array, number[][]>();

function blocksByGroup(grp: Int16Array): number[][] {
	let b = seqBlocks.get(grp);
	if (!b) {
		const m = new Map<number, number[]>();
		for (let i = 0; i < grp.length; i++) {
			const a = m.get(grp[i]);
			if (a) a.push(i);
			else m.set(grp[i], [i]);
		}
		b = [...m.keys()].sort((x, y) => x - y).map((g) => m.get(g) as number[]);
		seqBlocks.set(grp, b);
	}
	return b;
}

/** Reset the fields a draw may rewrite so `t` starts as an exact copy of `k`. */
function resetInto(k: KhipuLite, t: KhipuLite): void {
	t.seq.set(k.seq);
	t.pv.set(k.pv);
	t.pCol.set(k.pCol);
	for (let i = 0; i < k.pSubs.length; i++) t.pSubs[i] = k.pSubs[i];
	for (let i = 0; i < k.sizes.length; i++) t.sizes[i] = k.sizes[i];
	for (let i = 0; i < k.clusters.length; i++) {
		const s = k.clusters[i];
		const d = t.clusters[i];
		if (s.k === "P" && d.k === "P") {
			d.start = s.start;
			d.size = s.size;
		} else if (s !== d) {
			t.clusters[i] =
				s.k === "P"
					? { k: "P", start: s.start, size: s.size }
					: { k: "T", values: s.values };
		}
	}
}

/** swap whole pendants i and j (value, colour, subsidiaries) */
function swapPendant(t: KhipuLite, i: number, j: number): void {
	const v = t.pv[i];
	t.pv[i] = t.pv[j];
	t.pv[j] = v;
	const c = t.pCol[i];
	t.pCol[i] = t.pCol[j];
	t.pCol[j] = c;
	const s = t.pSubs[i];
	t.pSubs[i] = t.pSubs[j];
	t.pSubs[j] = s;
}

/**
 * One draw of `k` under `model`. With `scratch` (a cloneLite of `k`, reused
 * across replicates) the draw is written into it; otherwise a fresh clone is
 * returned. `k` is never mutated.
 */
export function drawNull(
	k: KhipuLite,
	model: NullModel,
	rng: Rng,
	scratch?: KhipuLite,
): KhipuLite {
	let t: KhipuLite;
	if (scratch) {
		if (scratch === k)
			throw new Error("drawNull: scratch must not be the source");
		resetInto(k, scratch);
		t = scratch;
	} else {
		t = cloneLite(k);
	}
	switch (model) {
		case "sequence":
			shuffleInPlace(t.seq, rng);
			break;
		case "seqWithin":
			for (const b of blocksByGroup(k.grp)) {
				for (let i = b.length - 1; i > 0; i--) {
					const j = Math.floor(rng() * (i + 1));
					const x = t.seq[b[i]];
					t.seq[b[i]] = t.seq[b[j]];
					t.seq[b[j]] = x;
				}
			}
			break;
		case "values":
			shuffleInPlace(t.pv, rng);
			break;
		case "pendants":
			for (let i = t.pv.length - 1; i > 0; i--) {
				swapPendant(t, i, Math.floor(rng() * (i + 1)));
			}
			break;
		case "within":
			for (const cl of k.clusters) {
				if (cl.k !== "P") continue;
				for (let i = cl.size - 1; i > 0; i--) {
					swapPendant(t, cl.start + i, cl.start + Math.floor(rng() * (i + 1)));
				}
			}
			break;
		case "groupOrder":
			drawGroupOrder(k, t, rng);
			break;
		default: {
			const never: never = model;
			throw new Error(`unknown null model ${String(never)}`);
		}
	}
	return t;
}

/**
 * Permute the P-cluster blocks among the P positions (T clusters fixed), then
 * lay the blocks out again from `k` into `t`: pv, pCol, pSubs, sizes and the P
 * cluster entries are rewritten consistently.
 */
function drawGroupOrder(k: KhipuLite, t: KhipuLite, rng: Rng): void {
	const pos: number[] = []; // cluster indices of P clusters
	for (let i = 0; i < k.clusters.length; i++)
		if (k.clusters[i].k === "P") pos.push(i);
	const perm = pos.slice();
	shuffleInPlace(perm, rng);
	let slot = 0;
	for (let x = 0; x < pos.length; x++) {
		const src = k.clusters[perm[x]] as { k: "P"; start: number; size: number };
		for (let j = 0; j < src.size; j++) {
			t.pv[slot + j] = k.pv[src.start + j];
			t.pCol[slot + j] = k.pCol[src.start + j];
			t.pSubs[slot + j] = k.pSubs[src.start + j];
		}
		const d = t.clusters[pos[x]] as { k: "P"; start: number; size: number };
		d.start = slot;
		d.size = src.size;
		t.sizes[x] = src.size;
		slot += src.size;
	}
}
