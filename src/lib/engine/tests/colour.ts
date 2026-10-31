/**
 * White pendants carry larger numbers: the white row of
 * scripts/deep/vocab_d_colour.py. Node-importable.
 *
 * Per khipu, the level-1 cords (vocab_common.pendants takes every level-1
 * cord, top cords included) with value > 0 and one solid colour; values are
 * rank-normalised to percentiles (rank - 0.5) / n with average ranks (scipy
 * rankdata). A khipu is used when it has >= minPendants such cords and >= 2
 * colours. Statistic = mean, over the used khipus that have white ("W") cords,
 * of (mean white percentile - 0.5), each khipu weighing once. Null: the values
 * permuted among those cords within the khipu, colours fixed ("values"), or
 * within each group ("within", an engine extension). The Python drops the
 * NOT_DECIMAL khipus; cord data errors are dropped too (none today).
 *
 * Rule difference (contract gap): the Python's "one solid colour" is a cord
 * whose colorParsed has exactly one segment with one code. corpus-lite keeps
 * only the longest colour segment per cord, so the engine takes a cord whose
 * longest-colour key is a single code (no ":", "-", "%", "^", "/"). That also
 * admits multi-segment cords whose longest segment is solid, and cords with no
 * colorParsed. On the 2026-09-24 data: Python 417 khipus used, 317 with white,
 * effect +0.0428 (null sd 0.006, z +7.2, 2000 perms); this rule 432 used, 332
 * with white, effect +0.0423 (790 of 29,184 valued cords classed differently).
 */
import type { CorpusLite, Executor, Hit, Rng, Spec } from "../../next/types.ts";
import { FLAG } from "../../next/types.ts";
import { hasFlag, isArithmetic } from "../corpus.ts";
import { specNum, specStr } from "./sums.ts";

const WHITE = "W";
const COMPOUND = /[-:%^/(]/;

interface Unit {
	id: string;
	/** level-1 indices of the included cords */
	at: number[];
	/** percentile of each included cord's value */
	pct: Float64Array;
	/** 1 where the cord is white */
	white: Uint8Array;
	nWhite: number;
	/** index blocks (into the included cords) per group, for the "within" null */
	blocks: number[][];
}

/** average ranks, 1-based (scipy.stats.rankdata default) */
function avgRanks(v: number[]): Float64Array {
	const n = v.length;
	const order = Array.from({ length: n }, (_, i) => i).sort(
		(a, b) => v[a] - v[b],
	);
	const r = new Float64Array(n);
	let i = 0;
	while (i < n) {
		let j = i;
		while (j + 1 < n && v[order[j + 1]] === v[order[i]]) j++;
		const avg = (i + j) / 2 + 1;
		for (let x = i; x <= j; x++) r[order[x]] = avg;
		i = j + 1;
	}
	return r;
}

const memo = new WeakMap<CorpusLite, Map<string, Unit[]>>();

function unitsOf(c: CorpusLite, spec: Spec): Unit[] {
	const minP = specNum(spec, "minPendants", 8);
	const exclude = specStr(spec, "exclude", "none");
	const key = `${minP}|${exclude}`;
	let m = memo.get(c);
	if (!m) {
		m = new Map();
		memo.set(c, m);
	}
	const hit = m.get(key);
	if (hit) return hit;
	const solid = c.colours.map((s) => (s && !COMPOUND.test(s) ? s : null));
	const out: Unit[] = [];
	for (const k of c.khipus) {
		if (!isArithmetic(k)) continue;
		if (exclude === "inkawasi" && hasFlag(k, FLAG.INKAWASI)) continue;
		const at: number[] = [];
		const cols: string[] = [];
		const vals: number[] = [];
		for (let i = 0; i < k.seq.length; i++) {
			const v = k.seq[i];
			const col = k.col[i] >= 0 ? solid[k.col[i]] : null;
			if (!(v > 0) || !col) continue;
			at.push(i);
			cols.push(col);
			vals.push(v);
		}
		if (at.length < minP || new Set(cols).size < 2) continue;
		const white = Uint8Array.from(cols, (x) => (x === WHITE ? 1 : 0));
		let nWhite = 0;
		for (const w of white) nWhite += w;
		if (!nWhite) continue;
		const n = at.length;
		const r = avgRanks(vals);
		const pct = r.map((x) => (x - 0.5) / n);
		const byG = new Map<number, number[]>();
		at.forEach((li, j) => {
			const g = k.grp[li];
			const b = byG.get(g);
			if (b) b.push(j);
			else byG.set(g, [j]);
		});
		const blocks = [...byG.keys()]
			.sort((a, b) => a - b)
			.map((g) => byG.get(g) as number[]);
		out.push({ id: k.id, at, pct, white, nWhite, blocks });
	}
	m.set(key, out);
	return out;
}

function effectOf(u: Unit, pct: ArrayLike<number>): number {
	let s = 0;
	for (let j = 0; j < u.white.length; j++) if (u.white[j]) s += pct[j];
	return s / u.nWhite - 0.5;
}

/**
 * Permuting the values permutes their percentiles, so a null draw shuffles
 * the percentile vector (ties keep their average rank, as rankdata of the
 * permuted values would give).
 */
function shuffled(u: Unit, within: boolean, rng: Rng, buf: Float64Array) {
	buf.set(u.pct);
	const blocks = within ? u.blocks : null;
	if (!blocks) {
		for (let i = buf.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			const t = buf[i];
			buf[i] = buf[j];
			buf[j] = t;
		}
		return;
	}
	for (const b of blocks)
		for (let i = b.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			const t = buf[b[i]];
			buf[b[i]] = buf[b[j]];
			buf[b[j]] = t;
		}
}

/** mean excess percentile of white cords within their khipu */
export const whiteLargerExec: Executor = {
	scope: "corpus",
	nullKind: "replicate",
	observe(c, spec) {
		const us = unitsOf(c, spec);
		const hits: Hit[] = [];
		let s = 0;
		let pos = 0;
		for (const u of us) {
			const e = effectOf(u, u.pct);
			s += e;
			if (e > 0) pos++;
			hits.push({
				ids: [u.id],
				at: [u.at.filter((_, j) => u.white[j] === 1)],
				value: e,
			});
		}
		return {
			value: us.length ? s / us.length : 0,
			hits,
			detail: { khipus: us.length, whiteLarger: pos },
		};
	},
	replicate(c, spec, rng) {
		const us = unitsOf(c, spec);
		const within = specStr(spec, "null", "values") === "within";
		let s = 0;
		let buf = new Float64Array(0);
		for (const u of us) {
			if (buf.length < u.pct.length) buf = new Float64Array(u.pct.length * 2);
			const view = buf.subarray(0, u.pct.length);
			shuffled(u, within, rng, view);
			s += effectOf(u, view);
		}
		return us.length ? s / us.length : 0;
	},
};
