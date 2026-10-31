/**
 * Pair data for the Proving Ground's evidence views: the dots of a synteny
 * dotplot (equal values, near values), the row "ghost" a shuffle of the
 * partner would produce, and one khipu's level-1 cords in the shape the
 * dotplot, tracks and lineup draw from. Pure functions apart from the types.
 */
import type { Cord, Khipu } from "#/lib/khipu/types";

/** "KH0097|KH0586" → ["KH0097", "KH0586"] */
export function splitPair(pair: string): [string, string] {
	const [a, b = ""] = pair.split("|");
	return [a, b];
}

/** positions of each nonzero value in `b` */
function positions(b: ArrayLike<number>): Map<number, number[]> {
	const m = new Map<number, number[]>();
	for (let j = 0; j < b.length; j++) {
		const v = b[j];
		if (!v) continue;
		let l = m.get(v);
		if (!l) {
			l = [];
			m.set(v, l);
		}
		l.push(j);
	}
	return m;
}

/** Flat [i, j, i, j, …] of every cell where a[i] === b[j] !== 0. */
export function exactDots(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
): Int32Array {
	const at = positions(b);
	const out: number[] = [];
	for (let i = 0; i < a.length; i++) {
		const v = a[i];
		if (!v) continue;
		const js = at.get(v);
		if (!js) continue;
		for (const j of js) out.push(i, j);
	}
	return Int32Array.from(out);
}

/** two numbers of one length that differ in a single decimal digit
 * (the same rule as stories/totals.ts oneDigitApart) */
export function oneDigitApart(a: number, b: number): boolean {
	const x = String(Math.trunc(Math.abs(a)));
	const y = String(Math.trunc(Math.abs(b)));
	if (x.length !== y.length) return false;
	let d = 0;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
	return d === 1;
}

/**
 * near but not equal: both 100 or more, and within 2% or one digit apart.
 * (Below 100 "one digit apart" pairs nearly every small value with its
 * neighbours — 2 and 3, 12 and 13 — and the plot drowns in them.)
 */
export function isNear(x: number, y: number): boolean {
	if (!x || !y || x === y || x < 100 || y < 100) return false;
	return Math.abs(x - y) <= 0.02 * Math.max(x, y) || oneDigitApart(x, y);
}

/** Flat [i, j, …] of cells whose values are near (isNear) but not exact. */
export function nearDots(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
): Int32Array {
	const out: number[] = [];
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		if (!x) continue;
		for (let j = 0; j < b.length; j++) if (isNear(x, b[j])) out.push(i, j);
	}
	return Int32Array.from(out);
}

/**
 * Per row i of the dotplot (a cord of `a`): the chance that a given cell of
 * that row is an exact match when `b` is shuffled, count_b(a_i) / n_b. Where
 * chance matches would land; 0 for blank cords.
 */
export function rowGhost(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
): Float32Array {
	const count = new Map<number, number>();
	for (let j = 0; j < b.length; j++)
		if (b[j]) count.set(b[j], (count.get(b[j]) ?? 0) + 1);
	const out = new Float32Array(a.length);
	const n = Math.max(1, b.length);
	for (let i = 0; i < a.length; i++)
		out[i] = a[i] ? (count.get(a[i]) ?? 0) / n : 0;
	return out;
}

/* ─────────── one khipu, as the pair views draw it ─────────── */

export interface PairSide {
	id: string;
	/** catalogue name (AS…, else the first alias) */
	alias: string;
	/** level-1 cords by ordinal, top cords included */
	cords: Cord[];
	names: string[];
	/** value ?? 0 per level-1 cord (knot-read where valueSource is "knots") */
	values: number[];
	/** Ascher code of each cord's first colour, or null */
	colour: (string | null)[];
	/** direct subsidiaries per level-1 cord, file order */
	subs: Cord[][];
	broken: boolean[];
	/** knot-read value where the KFG value differs from the knots */
	conflict: (number | null)[];
	top: boolean[];
}

/** Level-1 cords of a full khipu in the engine's order (level 1 by ordinal). */
export function pairSide(
	k: Khipu,
	valueSource: "kfg" | "knots" = "kfg",
): PairSide {
	const l1 = k.cords
		.filter((c) => c.level === 1)
		.sort((x, y) => x.ordinal - y.ordinal);
	const byParent = new Map<string, Cord[]>();
	for (const c of k.cords) {
		if (c.level !== 2 || !c.parent || c.kind !== "subsidiary") continue;
		let l = byParent.get(c.parent);
		if (!l) {
			l = [];
			byParent.set(c.parent, l);
		}
		l.push(c);
	}
	const alias = k.aliases.find((a) => a.startsWith("AS")) ?? k.aliases[0];
	return {
		id: k.id,
		alias: alias ?? k.id,
		cords: l1,
		names: l1.map((c) => c.name),
		values: l1.map((c) =>
			valueSource === "knots" && c.valueConflict
				? c.valueConflict.knots
				: (c.value ?? 0),
		),
		colour: l1.map(
			(c) =>
				c.colorParsed?.[0]?.codes[0] ?? c.color?.split(/[:\-%^]/)[0] ?? null,
		),
		subs: l1.map((c) => byParent.get(c.name) ?? []),
		broken: l1.map((c) => c.term === "B"),
		conflict: l1.map((c) => c.valueConflict?.knots ?? null),
		top: l1.map((c) => c.kind === "top"),
	};
}

/**
 * Blind-mode stand-ins: dense ranks over the nonzero values of both sides
 * together, so equal values keep equal ranks and nothing else shows.
 */
export function blindRanks(...sides: ArrayLike<number>[]): Map<number, number> {
	const vals = new Set<number>();
	for (const s of sides)
		for (let i = 0; i < s.length; i++) if (s[i]) vals.add(s[i]);
	const sorted = [...vals].sort((x, y) => x - y);
	return new Map(sorted.map((v, i) => [v, i + 1]));
}

/** p with 2 significant figures, or "< 1/(R+1)" at the replicate floor. */
export function formatP(p: number | null | undefined, R?: number): string {
	if (p == null || !Number.isFinite(p)) return "—";
	if (R && p <= 1 / (R + 1) + 1e-12) return `< ${fmtSig(1 / (R + 1))}`;
	return fmtSig(p);
}

function fmtSig(x: number): string {
	if (x === 0) return "0";
	if (x >= 1e-4) return String(Number(x.toPrecision(2)));
	return x.toExponential(1).replace("e-", "e−");
}

/** a number for display: en-locale, at most `digits` decimals */
export function fmtNum(x: number | null | undefined, digits = 1): string {
	if (x == null || !Number.isFinite(x)) return "—";
	return x.toLocaleString("en", { maximumFractionDigits: digits });
}
