import type { Cord, Khipu } from "#/lib/khipu/types";
import {
	cordValues,
	PACHACAMAC_LONG_ID,
	PACHACAMAC_TABLE_ID,
	pendantCords,
} from "#/lib/stories/crosslinks";

/**
 * Derivations for the Basel reconstruction: the ten fragments catalogued
 * under Museum der Kulturen IVc.366.03 (KH0682–KH0691, MM008–MM017) against
 * the two Berlin Pachacamac khipus KH0450 (UR212, VA42513) and KH0147
 * (AS131, VA42510).
 *
 * Each Berlin khipu carries fourteen big groups: KH0450's groups of ten or
 * more cords (its 3-cord g4 and 1-cord g9 set aside), KH0147's ten-cord
 * groups (singleton separators and the 2-cord g2 set aside). A fragment's
 * brown cords repeat one KH0450 group and its white cords one KH0147 group,
 * and where a fragment has both, the group numbers agree under one rule:
 *
 *   KH0450 unit k counted from its END  =  KH0147 unit k counted from its START
 *
 * Everything on the page is computed here from the recorded cords; the only
 * constants are the fragment ids and the thresholds of the run search
 * (scripts/basel_fragments.py reproduces the same placements).
 */

export const BASEL_FRAGMENT_IDS = [
	"KH0682",
	"KH0683",
	"KH0684",
	"KH0685",
	"KH0686",
	"KH0687",
	"KH0688",
	"KH0689",
	"KH0690",
	"KH0691",
] as const;

export const BASEL_IDS = [
	PACHACAMAC_LONG_ID,
	PACHACAMAC_TABLE_ID,
	...BASEL_FRAGMENT_IDS,
] as const;

/** Groups of fewer cords than this are separators, not units. */
export const BIG_GROUP = 10;
/** A run this long, with three distinct values and one of at least ten, places a fragment. */
export const FIRM_RUN = 3;
/** Two adjacent values of at least this size count as a probable placement. */
export const PROBABLE_VALUE = 50;

export interface Unit {
	/** 1-based unit number under the rule */
	k: number;
	/** 0-based recorded group index on the Berlin khipu */
	group: number;
	cords: Cord[];
	values: number[];
}

function bigGroups(khipu: Khipu): { group: number; cords: Cord[] }[] {
	const byGroup = new Map<number, Cord[]>();
	for (const cord of pendantCords(khipu)) {
		if (cord.group == null) continue;
		const list = byGroup.get(cord.group) ?? [];
		list.push(cord);
		byGroup.set(cord.group, list);
	}
	return [...byGroup.entries()]
		.filter(([, cords]) => cords.length >= BIG_GROUP)
		.sort((a, b) => a[0] - b[0])
		.map(([group, cords]) => ({ group, cords }));
}

/** KH0450's big groups numbered from its end: its last group is unit 1. */
export function brownUnits(long: Khipu): Unit[] {
	const groups = bigGroups(long);
	return groups.map(({ group, cords }, i) => ({
		k: groups.length - i,
		group,
		cords,
		values: cordValues(cords),
	}));
}

/** KH0147's ten-cord groups numbered from its start. */
export function whiteUnits(table: Khipu): Unit[] {
	return bigGroups(table).map(({ group, cords }, i) => ({
		k: i + 1,
		group,
		cords,
		values: cordValues(cords),
	}));
}

export type Direction = "forward" | "reversed";

export interface RunMatch {
	/** how many consecutive values agree */
	length: number;
	/** 0-based start on the fragment's level-1 sequence */
	fragmentStart: number;
	/** 0-based start within the unit, in the unit's own order */
	unitStart: number;
	/** whether the fragment reads the unit forwards or backwards */
	direction: Direction;
	/** the agreeing values, in fragment order */
	values: number[];
	firm: boolean;
}

function informative(values: number[], minLen: number): boolean {
	if (values.length < minLen) return false;
	const nonzero = values.filter((v) => v > 0);
	if (minLen >= FIRM_RUN) {
		return new Set(nonzero).size >= 3 && Math.max(...values) >= 10;
	}
	return (
		nonzero.length === values.length && Math.min(...values) >= PROBABLE_VALUE
	);
}

/** Longest run shared by a value sequence and a unit, forward or reversed. */
export function bestRun(
	seq: number[],
	unit: number[],
	minLen = FIRM_RUN,
): RunMatch | null {
	let best: RunMatch | null = null;
	const tries: [Direction, number[]][] = [
		["forward", unit],
		["reversed", [...unit].reverse()],
	];
	for (const [direction, target] of tries) {
		for (let i = 0; i < seq.length; i++) {
			for (let j = 0; j < target.length; j++) {
				let n = 0;
				while (
					i + n < seq.length &&
					j + n < target.length &&
					seq[i + n] === target[j + n]
				) {
					n++;
				}
				const values = seq.slice(i, i + n);
				if (!informative(values, minLen)) continue;
				if (!best || n > best.length) {
					best = {
						length: n,
						fragmentStart: i,
						unitStart: direction === "forward" ? j : unit.length - j - n,
						direction,
						values,
						firm: minLen >= FIRM_RUN,
					};
				}
			}
		}
	}
	return best;
}

export interface HalfPlacement {
	unit: Unit;
	run: RunMatch;
}

export interface Placement {
	id: string;
	alias: string;
	/** level-1 cords on the fragment */
	cords: number;
	brown: HalfPlacement | null;
	white: HalfPlacement | null;
	/** both halves present and on the same unit number */
	ruleHolds: boolean | null;
	/** a stray final value equal to the closing cord of a white unit */
	tail: { value: number; unit: Unit } | null;
	/** how the recorder's cord order runs relative to the reconstruction */
	orientation: string;
}

function placeHalf(seq: number[], units: Unit[]): HalfPlacement | null {
	let best: HalfPlacement | null = null;
	for (const minLen of [FIRM_RUN, 2]) {
		for (const unit of units) {
			const run = bestRun(seq, unit.values, minLen);
			if (run && (!best || run.length > best.run.length)) best = { unit, run };
		}
		if (best) return best;
	}
	return null;
}

function describeOrientation(p: {
	brown: HalfPlacement | null;
	white: HalfPlacement | null;
}): string {
	const b = p.brown?.run.direction;
	const w = p.white?.run.direction;
	if (b && w) {
		const brownFirst =
			(p.brown?.run.fragmentStart ?? 0) < (p.white?.run.fragmentStart ?? 0);
		const parts = brownFirst
			? [`brown ${b}`, "blank", `white ${w}`]
			: [`white ${w}`, "blank", `brown ${b}`];
		return parts.join(" · ");
	}
	if (b) return `brown ${b}`;
	if (w) return `white ${w}`;
	return "unplaced";
}

export function placeFragments(
	long: Khipu,
	table: Khipu,
	fragments: Khipu[],
): Placement[] {
	const brown = brownUnits(long);
	const white = whiteUnits(table);
	return fragments.map((fragment) => {
		const level1 = fragment.cords
			.filter((c) => c.level === 1)
			.sort((a, b) => a.ordinal - b.ordinal);
		const seq = cordValues(level1);
		const b = placeHalf(seq, brown);
		const w = placeHalf(seq, white);
		const last = seq.at(-1) ?? 0;
		const covered = new Set<number>();
		for (const half of [b, w]) {
			if (!half) continue;
			for (let i = 0; i < half.run.length; i++) {
				covered.add(half.run.fragmentStart + i);
			}
		}
		const tailUnit =
			last >= 10 && !covered.has(seq.length - 1)
				? white.find((u) => u.values.at(-1) === last)
				: undefined;
		return {
			id: fragment.id,
			alias: fragment.aliases[0] ?? fragment.id,
			cords: level1.length,
			brown: b,
			white: w,
			ruleHolds: b && w ? b.unit.k === w.unit.k : null,
			tail: tailUnit ? { value: last, unit: tailUnit } : null,
			orientation: describeOrientation({ brown: b, white: w }),
		};
	});
}

/** Unit numbers fixed on either side, for the reconstruction strip. */
export function fixedUnits(placements: Placement[]): {
	brown: Map<number, string[]>;
	white: Map<number, string[]>;
} {
	const brown = new Map<number, string[]>();
	const white = new Map<number, string[]>();
	for (const p of placements) {
		if (p.brown?.run.firm) {
			brown.set(p.brown.unit.k, [...(brown.get(p.brown.unit.k) ?? []), p.id]);
		}
		if (p.white?.run.firm) {
			white.set(p.white.unit.k, [...(white.get(p.white.unit.k) ?? []), p.id]);
		}
	}
	return { brown, white };
}

export interface UnitTotal {
	k: number;
	white: number;
	brown: number;
	ratio: number | null;
}

/** Sum of each unit on both Berlin khipus, paired under the rule. */
export function unitTotals(long: Khipu, table: Khipu): UnitTotal[] {
	const brown = new Map(brownUnits(long).map((u) => [u.k, u]));
	return whiteUnits(table).map((w) => {
		const b = brown.get(w.k);
		const whiteSum = w.values.reduce((s, v) => s + v, 0);
		const brownSum = b ? b.values.reduce((s, v) => s + v, 0) : 0;
		return {
			k: w.k,
			white: whiteSum,
			brown: brownSum,
			ratio: brownSum ? whiteSum / brownSum : null,
		};
	});
}

/** Subsidiary values hanging from a run of level-1 cords, in order. */
export function subsidiaryValues(khipu: Khipu, cords: Cord[]): number[][] {
	return cords.map((parent) =>
		khipu.cords
			.filter(
				(c) =>
					c.level === 2 &&
					c.name.startsWith(`${parent.name}s`) &&
					!c.name.slice(parent.name.length + 1).includes("s"),
			)
			.sort((a, b) => a.ordinal - b.ordinal)
			.map((c) => c.value ?? 0),
	);
}

/** One in 14^n: the chance n two-sided fragments land on matching unit numbers. */
export function ruleChance(units: number, fragments: number): number {
	return units ** fragments;
}

/**
 * The unit's values in the order the fragment reads them, beside the
 * fragment's own values over the same span (null where the fragment has no
 * cord), so a PairedPassage can show the whole unit with the run inside it.
 */
export function alignedPassage(
	fragment: Khipu,
	half: HalfPlacement,
): { left: number[]; right: (number | null)[] } {
	const seq = cordValues(
		fragment.cords
			.filter((c) => c.level === 1)
			.sort((a, b) => a.ordinal - b.ordinal),
	);
	const { unit, run } = half;
	const left =
		run.direction === "reversed" ? [...unit.values].reverse() : unit.values;
	const startInLeft =
		run.direction === "reversed"
			? unit.values.length - run.unitStart - run.length
			: run.unitStart;
	const offset = run.fragmentStart - startInLeft;
	const right = left.map((_, i) => seq[offset + i] ?? null);
	return { left, right };
}
