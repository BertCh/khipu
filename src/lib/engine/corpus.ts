/**
 * The in-memory corpus for the /next engine, parsed from
 * public/data/next/corpus-lite.json (scripts/next/build_corpus.py).
 * Node-importable: no import.meta, no `#/` imports.
 *
 * Two views of each khipu:
 * - the level-1 sequence `seq` (top cords included, file values), which the
 *   passage and pair tests read;
 * - the pendant model `pv` (pendants only, group order then ordinal, truncated
 *   values), with colours, subsidiaries, group sizes and clusters, which the
 *   Medrano & Khosla and profile tests read. This is the model of the verified
 *   bench port (compute-audit §3): groups in ascending order, the pendants of
 *   a group form a P cluster, a group with no pendants a T cluster of its
 *   truncated values.
 */

import type {
	Cluster,
	CorpusLite,
	CorpusLiteFile,
	KhipuLite,
	KhipuLiteRaw,
	ValueSource,
} from "../next/types.ts";
import { FLAG } from "../next/types.ts";
import type { StrandFile } from "../stories/strands.ts";

/** Wari first (nine), then the declared unreadable khipus (compute-audit §3). */
export const NOT_DECIMAL_IDS: readonly string[] = [
	"KH0280",
	"KH0281",
	"KH0282",
	"KH0288",
	"KH0289",
	"KH0271",
	"KH0346",
	"KH0348",
	"KH0384",
	"KH0015",
	"KH0047",
	"KH0048",
	"KH0094",
	"KH0100",
	"KH0108",
	"KH0584",
];

export const WARI_IDS: readonly string[] = NOT_DECIMAL_IDS.slice(0, 9);

const KIND_CODE: Record<string, number> = { P: 0, T: 1, M: 2 };
const TERM_CODE: Record<string, number> = { K: 0, B: 1, "?": 2 };

function buildKhipu(r: KhipuLiteRaw, index: number): KhipuLite {
	const n = r.seq.length;
	const seq = Float64Array.from(r.seq);
	const kind = new Uint8Array(n);
	const term = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		kind[i] = KIND_CODE[r.kind[i]] ?? 2;
		term[i] = TERM_CODE[r.term[i]] ?? 2;
	}
	const k: KhipuLite = {
		id: r.id,
		index,
		seq,
		kind,
		grp: Int16Array.from(r.grp),
		col: Int32Array.from(r.col),
		term,
		subs: new Map(r.subs.map(([i, vs]) => [i, vs])),
		kv: new Map(r.kv.map(([i, v]) => [i, v])),
		nConflicts: r.nConflicts ?? r.kv.length,
		pv: new Int32Array(0),
		pL1: new Int32Array(0),
		pCol: new Int32Array(0),
		pSubs: [],
		sizes: [],
		clusters: [],
		flags: r.flags,
		place: r.place,
		museum: r.museum,
		age: r.age ? [r.age[0], r.age[1]] : null,
	};
	derivePendants(k);
	return k;
}

/** Fill pv, pL1, pCol, pSubs, sizes and clusters from seq/kind/grp/col/subs. */
function derivePendants(k: KhipuLite): void {
	const n = k.seq.length;
	// level-1 indices by group, ascending group, ordinal order within
	const order = Array.from({ length: n }, (_, i) => i).sort(
		(a, b) => k.grp[a] - k.grp[b] || a - b,
	);
	let nP = 0;
	for (let i = 0; i < n; i++) if (k.kind[i] === 0) nP++;
	const pv = new Int32Array(nP);
	const pL1 = new Int32Array(nP);
	const pCol = new Int32Array(nP);
	const pSubs: number[][] = new Array(nP);
	const sizes: number[] = [];
	const clusters: Cluster[] = [];
	let slot = 0;
	let x = 0;
	while (x < n) {
		const g = k.grp[order[x]];
		let y = x;
		while (y < n && k.grp[order[y]] === g) y++;
		const start = slot;
		for (let z = x; z < y; z++) {
			const i = order[z];
			if (k.kind[i] !== 0) continue;
			pv[slot] = Math.trunc(k.seq[i]);
			pL1[slot] = i;
			pCol[slot] = k.col[i];
			pSubs[slot] = k.subs.get(i) ?? [];
			slot++;
		}
		if (slot > start) {
			sizes.push(slot - start);
			clusters.push({ k: "P", start, size: slot - start });
		} else {
			const values: number[] = [];
			for (let z = x; z < y; z++) values.push(Math.trunc(k.seq[order[z]]));
			clusters.push({ k: "T", values });
		}
		x = y;
	}
	k.pv = pv;
	k.pL1 = pL1;
	k.pCol = pCol;
	k.pSubs = pSubs;
	k.sizes = sizes;
	k.clusters = clusters;
}

function valueCounts(khipus: KhipuLite[]): {
	valueFreq: Map<number, number>;
	valueTotal: number;
} {
	const valueFreq = new Map<number, number>();
	let valueTotal = 0;
	for (const k of khipus) {
		for (let i = 0; i < k.seq.length; i++) {
			const v = k.seq[i];
			if (v === 0) continue;
			valueFreq.set(v, (valueFreq.get(v) ?? 0) + 1);
			valueTotal++;
		}
	}
	return { valueFreq, valueTotal };
}

export function parseCorpus(
	raw: CorpusLiteFile,
	strands?: StrandFile,
): CorpusLite {
	const khipus = raw.khipus.map((r, i) => buildKhipu(r, i));
	return {
		dataHash: raw.dataHash,
		generated: raw.generated,
		khipus,
		byId: new Map(khipus.map((k) => [k.id, k])),
		colours: raw.colours,
		places: raw.places,
		museums: raw.museums,
		...valueCounts(khipus),
		strands,
	};
}

const knotsMemo = new WeakMap<CorpusLite, CorpusLite>();

/**
 * The corpus under a value source. "kfg" is the file as built; "knots" is a
 * memoised copy in which every cord carrying a value/knot conflict takes its
 * knot-derived value (in seq, pv and the T clusters). Khipus with no conflict
 * are shared between the two.
 */
export function corpusFor(c: CorpusLite, src: ValueSource): CorpusLite {
	if (src === "kfg") return c;
	const hit = knotsMemo.get(c);
	if (hit) return hit;
	const khipus = c.khipus.map((k) => {
		if (k.kv.size === 0) return k;
		const seq = Float64Array.from(k.seq);
		for (const [i, v] of k.kv) seq[i] = v;
		const nk: KhipuLite = { ...k, seq };
		derivePendants(nk);
		return nk;
	});
	const out: CorpusLite = {
		...c,
		khipus,
		byId: new Map(khipus.map((k) => [k.id, k])),
		...valueCounts(khipus),
	};
	knotsMemo.set(c, out);
	knotsMemo.set(out, out);
	return out;
}

export function hasFlag(k: KhipuLite, f: number): boolean {
	return (k.flags & f) !== 0;
}

/** decimal-readable and free of cord data errors */
export function isArithmetic(k: KhipuLite): boolean {
	return !hasFlag(k, FLAG.NOT_DECIMAL) && !hasFlag(k, FLAG.CORD_DATA_ERROR);
}

const IC_CAP = 13;

/** information content of a value: min(13, -log2(freq / total)); 0 for 0; unseen values count once */
export function icOf(c: CorpusLite): (v: number) => number {
	const total = Math.max(1, c.valueTotal);
	const memo = new Map<number, number>();
	return (v: number) => {
		if (v === 0) return 0;
		let r = memo.get(v);
		if (r === undefined) {
			const f = c.valueFreq.get(v) ?? 1;
			r = Math.min(IC_CAP, -Math.log2(f / total));
			memo.set(v, r);
		}
		return r;
	};
}

/**
 * A copy safe to permute: new seq, pv, pCol, pSubs (outer array; the inner
 * subsidiary arrays are shared, never mutated), sizes and cluster objects.
 * Everything else is shared with `k`.
 */
export function cloneLite(k: KhipuLite): KhipuLite {
	return {
		...k,
		seq: Float64Array.from(k.seq),
		pv: Int32Array.from(k.pv),
		pCol: Int32Array.from(k.pCol),
		pSubs: k.pSubs.slice(),
		sizes: k.sizes.slice(),
		clusters: k.clusters.map((cl) =>
			cl.k === "P"
				? { k: "P", start: cl.start, size: cl.size }
				: { k: "T", values: cl.values },
		),
	};
}

/** pendant slot indices per P cluster, in cluster order */
export function pendantGroups(k: KhipuLite): number[][] {
	const out: number[][] = [];
	for (const cl of k.clusters) {
		if (cl.k !== "P") continue;
		const g = new Array<number>(cl.size);
		for (let j = 0; j < cl.size; j++) g[j] = cl.start + j;
		out.push(g);
	}
	return out;
}
