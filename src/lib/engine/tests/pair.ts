/**
 * One pair of khipus against its own chance: A stays fixed, B is shuffled
 * (whole sequence, or within its groups) and the pair statistic recomputed.
 * Node-importable.
 *
 * Statistic "sw": the best tolerant local alignment score (align.ts, forward
 * or B reversed). Statistic "run": the longest exact shared run of the
 * passage scan (passages.ts). observe() always reports both, plus the exact
 * runs as spans in forward coordinates of (a, b).
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
import { icOf } from "../corpus.ts";
import { drawNull } from "../nulls.ts";
import {
	type Encoded,
	encodeA,
	encodeB,
	encodePair,
	swBestEncoded,
} from "./align.ts";
import { pairRun, type ScanOpts } from "./passages.ts";

const icMemo = new WeakMap<CorpusLite, (v: number) => number>();

/** icOf, memoised per corpus */
export function icFor(c: CorpusLite): (v: number) => number {
	let f = icMemo.get(c);
	if (!f) {
		f = icOf(c);
		icMemo.set(c, f);
	}
	return f;
}

function truncated(s: ArrayLike<number>): Int32Array {
	const out = new Int32Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = Math.trunc(s[i]);
	return out;
}

function need(c: CorpusLite, id: string): KhipuLite {
	const k = c.byId.get(id);
	if (!k) throw new Error(`no khipu ${id} in the corpus`);
	return k;
}

interface Prep {
	A: KhipuLite;
	B: KhipuLite;
	encA: Int32Array;
	enc: Encoded;
	scratch: KhipuLite | null;
}

function scanOpts(spec: Spec): ScanOpts {
	return {
		windows: "5+4",
		minMax: typeof spec.minMax === "number" ? spec.minMax : 15,
	};
}

function range(from: number, len: number): number[] {
	const out = new Array<number>(len);
	for (let t = 0; t < len; t++) out[t] = from + t;
	return out;
}

/**
 * A pair executor over khipu `a` and a B side derived from the corpus
 * (`makeB`, default: khipu `b` itself). The controls use `makeB` to swap in
 * a seeded shuffle or a planted copy.
 */
export function pairExecFrom(
	a: string,
	b: string,
	makeB?: (c: CorpusLite) => KhipuLite,
): Executor {
	const memo = new WeakMap<CorpusLite, Prep>();
	const prep = (c: CorpusLite): Prep => {
		let p = memo.get(c);
		if (!p) {
			const A = need(c, a);
			const B = makeB ? makeB(c) : need(c, b);
			const ta = truncated(A.seq);
			const tb = truncated(B.seq);
			const enc = encodePair(ta, tb, icFor(c));
			p = { A, B, encA: encodeA(enc, ta), enc, scratch: null };
			memo.set(c, p);
		}
		return p;
	};
	const sw = (p: Prep, bSeq: ArrayLike<number>) =>
		swBestEncoded(p.encA, encodeB(p.enc, truncated(bSeq)), p.enc);

	return {
		scope: "pair",
		nullKind: "replicate",
		observe(c: CorpusLite, spec: Spec): Observation {
			const p = prep(c);
			const run = pairRun(p.A.seq, p.B.seq, scanOpts(spec));
			const s = sw(p, p.B.seq);
			const value = spec.statistic === "run" ? run.longest : s.score;
			const hit: Hit = {
				ids: [a, b],
				at: [
					run.spans.flatMap(([len, i]) => range(i, len)),
					run.spans.flatMap(([len, , j]) => range(j, len)),
				],
				value: run.longest,
				label:
					run.longest > 0
						? `longest exact run ${run.longest} (${run.dir})`
						: "no exact run",
			};
			return {
				value,
				hits: [hit],
				detail: {
					longest: run.longest,
					sw: s.score,
					runs: run.spans.length,
					swEndA: s.endA,
					swEndB: s.endB,
				},
				spans: run.spans,
				dir: run.longest > 0 ? run.dir : s.dir,
			};
		},
		replicate(c: CorpusLite, spec: Spec, rng: Rng): number {
			const p = prep(c);
			const model = spec.null === "seqWithin" ? "seqWithin" : "sequence";
			const t = drawNull(p.B, model, rng, p.scratch ?? undefined);
			p.scratch = t;
			if (spec.statistic === "run")
				return pairRun(p.A.seq, t.seq, scanOpts(spec)).longest;
			return sw(p, t.seq).score;
		},
	};
}

/** the pair test for khipus a and b (B shuffled, A fixed) */
export function pairExec(a: string, b: string): Executor {
	return pairExecFrom(a, b);
}
