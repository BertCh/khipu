import { knotDirs } from "#/lib/khipu/anatomy";
import type { Cord, Khipu, Knot } from "#/lib/khipu/types";

/**
 * Derivations for "Which way the knot": is the S/Z direction of a knot a free
 * sign, or a consequence of what kind of knot it is?
 *
 * Two levels. The corpus figures (63,000 knot clusters, 166 khipus that mix
 * directions, the recorder breakdown) cannot be computed in the browser from
 * 684 files, so scripts/knot_direction_by_type.py --json writes them to
 * public/data/stories/knot-direction.json and the route loads that file. The
 * per-khipu figures for the two exhibits (KH0450 and KH0285) are computed here
 * from the loaded records with the same definitions the script uses.
 *
 * Unit throughout: a *knot cluster* — one S, L or E entry in the record, which
 * carries one direction reading (a cluster written "ZZSZ" counts by its
 * majority letter). Expanding single-knot clusters to physical knots moves the
 * corpus Z share of singles from 70 % to 71 %; nothing else changes.
 */

export const RULE_ID = "KH0450";
export const HALVES_ID = "KH0285";

export type Dir = "S" | "Z";
export type Type3 = "S" | "L" | "E";
export const TYPES: Type3[] = ["S", "L", "E"];

export const TYPE_LABEL: Record<Type3, string> = {
	S: "single knot",
	L: "long knot",
	E: "figure-eight",
};

export interface CorpusMixedRow {
	id: string;
	aliases: string[];
	recorder: string;
	provenance: string | null;
	n: number;
	S: number;
	Z: number;
	rule: Partial<Record<Type3, Dir>>;
	explained: number;
	baseline: number;
	deviant: number;
}

export interface RecorderRow {
	recorder: string;
	khipus: number;
	/** "single/long" majority directions, e.g. "Z/S": 50 */
	rules: Record<string, number>;
	zShareSingles: number;
}

export interface KnotDirectionCorpus {
	generated: string;
	unit: string;
	nKhipus: number;
	table: Record<Type3, Record<Dir, number>>;
	mixed: CorpusMixedRow[];
	explained95: number;
	explained90: number;
	baseline95: number;
	recorders: RecorderRow[];
}

/** The direction reading of one cluster entry, or null when unrecorded. */
export function entryDir(knot: Knot): Dir | null {
	const ds = knotDirs(knot).filter((d) => d === "S" || d === "Z") as Dir[];
	if (!ds.length) return null;
	let s = 0;
	for (const d of ds) if (d === "S") s++;
	return s > ds.length / 2 ? "S" : s === ds.length / 2 ? ds[0] : "Z";
}

export function isType3(t: string): t is Type3 {
	return t === "S" || t === "L" || t === "E";
}

export interface ClusterReading {
	cord: Cord;
	knot: Knot;
	type: Type3;
	dir: Dir;
}

/** Every directed S/L/E cluster on the khipu, in cord then height order. */
export function readings(khipu: Khipu): ClusterReading[] {
	const out: ClusterReading[] = [];
	for (const cord of khipu.cords) {
		for (const knot of [...cord.knots].sort((a, b) => a.pos - b.pos)) {
			if (!isType3(knot.type)) continue;
			const dir = entryDir(knot);
			if (dir) out.push({ cord, knot, type: knot.type, dir });
		}
	}
	return out;
}

export type Rule = Partial<Record<Type3, Dir>>;

/** The majority direction of each knot type on the khipu. */
export function ruleOf(rs: ClusterReading[]): Rule {
	const rule: Rule = {};
	for (const t of TYPES) {
		let s = 0;
		let z = 0;
		for (const r of rs) {
			if (r.type !== t) continue;
			if (r.dir === "S") s++;
			else z++;
		}
		if (s + z) rule[t] = s >= z ? "S" : "Z";
	}
	return rule;
}

export interface Profile {
	n: number;
	S: number;
	Z: number;
	rule: Rule;
	/** share of clusters whose direction is the majority for their type */
	explained: number;
	/** share of clusters in the khipu's majority direction */
	baseline: number;
	deviants: ClusterReading[];
	byType: Record<Type3, Record<Dir, number>>;
}

export function profile(khipu: Khipu): Profile {
	const rs = readings(khipu);
	const rule = ruleOf(rs);
	const byType = {
		S: { S: 0, Z: 0 },
		L: { S: 0, Z: 0 },
		E: { S: 0, Z: 0 },
	};
	let S = 0;
	for (const r of rs) {
		byType[r.type][r.dir]++;
		if (r.dir === "S") S++;
	}
	const deviants = rs.filter((r) => rule[r.type] !== r.dir);
	const n = rs.length || 1;
	return {
		n: rs.length,
		S,
		Z: rs.length - S,
		rule,
		explained: 1 - deviants.length / n,
		baseline: Math.max(S, rs.length - S) / n,
		deviants,
		byType,
	};
}

/** "L→S, S→Z, E→Z" */
export function ruleText(rule: Rule): string {
	return TYPES.filter((t) => rule[t])
		.map((t) => `${t}→${rule[t]}`)
		.join(", ");
}

/** The cord-majority direction, for painting a khipu by direction. */
export function cordDir(cord: Cord): Dir | null {
	let s = 0;
	let z = 0;
	for (const k of cord.knots) {
		if (!isType3(k.type)) continue;
		const d = entryDir(k);
		if (d === "S") s++;
		else if (d === "Z") z++;
	}
	if (!s && !z) return null;
	return s > z ? "S" : "Z";
}

/**
 * Runs of same-direction cords along the level-1 sequence: KH0285 is one run
 * of S then one run of Z, which is what a change of hand looks like.
 */
export function directionRuns(
	khipu: Khipu,
): { dir: Dir; from: number; to: number; n: number }[] {
	const cords = khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
	const runs: { dir: Dir; from: number; to: number; n: number }[] = [];
	for (const c of cords) {
		const d = cordDir(c);
		if (!d) continue;
		const last = runs[runs.length - 1];
		if (last && last.dir === d) {
			last.to = c.ordinal;
			last.n++;
		} else runs.push({ dir: d, from: c.ordinal, to: c.ordinal, n: 1 });
	}
	return runs;
}

/** Share of clusters in the "not-that-type" direction, corpus table helper. */
export function zShare(row: Record<Dir, number>): number {
	return row.Z / Math.max(1, row.S + row.Z);
}

/** The commonest whole-khipu rules among the mixed khipus, as "L→S, S→Z, E→Z" strings. */
export function ruleCounts(
	rows: CorpusMixedRow[],
): { rule: string; n: number }[] {
	const c = new Map<string, number>();
	for (const r of rows) {
		const key = ruleText(r.rule);
		c.set(key, (c.get(key) ?? 0) + 1);
	}
	return [...c].map(([rule, n]) => ({ rule, n })).sort((a, b) => b.n - a.n);
}

/** Khipus where direction still varies after type: the honest test set. */
export function residual(
	rows: CorpusMixedRow[],
	minDeviant = 0.15,
): CorpusMixedRow[] {
	return rows
		.filter((r) => r.deviant >= minDeviant)
		.sort((a, b) => b.deviant - a.deviant);
}

/** Recorder rows condensed to the single/long rule the page prints. */
export function recorderSummary(rows: RecorderRow[], minKhipus = 10) {
	return rows
		.filter((r) => r.khipus >= minKhipus)
		.map((r) => {
			const zz = r.rules["Z/Z"] ?? 0;
			const ss = r.rules["S/S"] ?? 0;
			const zs = r.rules["Z/S"] ?? 0;
			const sz = r.rules["S/Z"] ?? 0;
			return {
				recorder: r.recorder,
				khipus: r.khipus,
				zz,
				ss,
				zs,
				sz,
				zShareSingles: r.zShareSingles,
			};
		});
}

/* ------------------------------------------------ the source and its copy */

/** KH0284 (UR053B): the khipu KH0285 retied, same recorder (Carrie Brezine). */
export const SOURCE_ID = "KH0284";

/**
 * A cord's direction by its single and long knots, figure-eights only when it
 * has nothing else. Figure-eights run Z on most khipus whatever the rest do,
 * so on a cord with one single knot S and one figure-eight Z the single knot
 * decides (cordDir calls that tie Z).
 */
export function cordDirSL(cord: Cord): Dir | null {
	let s = 0;
	let z = 0;
	for (const k of cord.knots) {
		if (k.type !== "S" && k.type !== "L") continue;
		const d = entryDir(k);
		if (d === "S") s++;
		else if (d === "Z") z++;
	}
	if (!s && !z) return cordDir(cord);
	return s >= z ? "S" : "Z";
}

export interface CopyThread {
	source: Cord;
	copy: Cord;
	value: number;
	dirSource: Dir | null;
	dirCopy: Dir | null;
}

export interface CopyDirections {
	threads: CopyThread[];
	/** matched figures S on the source and Z on the copy */
	flipped: CopyThread[];
	/** subsidiaries among the flipped source cords */
	flippedSubs: number;
	same: CopyThread[];
	/** single- and long-knot clusters on the flipped figures, by side and direction */
	clusters: { source: Record<Dir, number>; copy: Record<Dir, number> };
	/** the copy's first and last cord in the flipped run, and the source's */
	copyFrom: string;
	copyTo: string;
	sourceFrom: string;
	sourceTo: string;
}

/**
 * The matched figures of a source and its copy (a strands.json link with
 * a = source, b = copy), each side read at the cord that carries the value —
 * a subsidiary where the thread names one. The same count is
 * scripts/knot_direction_copy.py.
 */
export function copyDirections(
	source: Khipu,
	copy: Khipu,
	threads: {
		a: number[];
		b: number[];
		va: number;
		kind: string;
		subA?: string[];
		subB?: string[];
	}[],
): CopyDirections {
	const l1 = (k: Khipu) =>
		k.cords.filter((c) => c.level === 1).sort((x, y) => x.ordinal - y.ordinal);
	const s1 = l1(source);
	const c1 = l1(copy);
	const sBy = new Map(source.cords.map((c) => [c.name, c]));
	const cBy = new Map(copy.cords.map((c) => [c.name, c]));
	const out: CopyThread[] = [];
	for (const t of threads) {
		if (t.kind !== "exact" || t.a.length !== 1 || t.b.length !== 1) continue;
		const s = (t.subA?.[0] && sBy.get(t.subA[0])) || s1[t.a[0]];
		const c = (t.subB?.[0] && cBy.get(t.subB[0])) || c1[t.b[0]];
		if (!s || !c) continue;
		out.push({
			source: s,
			copy: c,
			value: t.va,
			dirSource: cordDirSL(s),
			dirCopy: cordDirSL(c),
		});
	}
	const flipped = out.filter((t) => t.dirSource === "S" && t.dirCopy === "Z");
	const clusters = {
		source: { S: 0, Z: 0 },
		copy: { S: 0, Z: 0 },
	};
	for (const t of flipped)
		for (const [side, cord] of [
			["source", t.source],
			["copy", t.copy],
		] as const)
			for (const k of cord.knots) {
				if (k.type !== "S" && k.type !== "L") continue;
				const d = entryDir(k);
				if (d) clusters[side][d]++;
			}
	const pendantOf = (c: Cord) => c.parent ?? c.name;
	return {
		threads: out,
		flipped,
		flippedSubs: flipped.filter((t) => t.source.level > 1).length,
		same: out.filter((t) => t.dirSource && t.dirSource === t.dirCopy),
		clusters,
		copyFrom: flipped[0]?.copy.name ?? "",
		copyTo: flipped[flipped.length - 1]?.copy.name ?? "",
		sourceFrom: flipped[0] ? pendantOf(flipped[0].source) : "",
		sourceTo: flipped.length
			? pendantOf(flipped[flipped.length - 1].source)
			: "",
	};
}
