import type { Cord, Khipu } from "#/lib/khipu/types";

/**
 * Derivations the stories make from a khipu's recorded structure. Nothing
 * here is read from the sources; it is all computed from cord values, order
 * and grouping, so every claim in a story can be traced back to cords.
 */

/** Level-1 pendants in recorded order, split by the recorder's cord groups. */
export function pendantGroups(khipu: Khipu): Cord[][] {
	const by = new Map<number, Cord[]>();
	for (const c of khipu.cords) {
		if (c.kind !== "pendant") continue;
		const g = c.group ?? -1;
		if (!by.has(g)) by.set(g, []);
		by.get(g)?.push(c);
	}
	return [...by.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, cords]) => cords.sort((a, b) => a.ordinal - b.ordinal));
}

/**
 * A cord that cannot be read in full: recorded as broken, a stub, or ending
 * so soon after its lowest tens-or-higher knot that the units position (tied
 * ~7 cm further down on these khipus) is gone with the missing length.
 */
export function isTruncated(c: Cord): boolean {
	if (c.notes && /broken|separated|missing|cut/i.test(c.notes)) return true;
	if (c.length == null) return false;
	if (c.length < 12) return true;
	const lowest = c.knots.reduce<Cord["knots"][number] | null>(
		(a, k) => (a == null || k.pos > a.pos ? k : a),
		null,
	);
	if (!lowest || lowest.value == null) return false;
	const perKnot = lowest.value / Math.max(1, lowest.n);
	return perKnot >= 10 && c.length - lowest.pos < 8;
}

export interface LedgerStats {
	groups: number;
	withFixed: number;
	balances: number;
	damaged: number;
	fails: number;
}

export function ledgerStats(groups: LedgerGroup[]): LedgerStats {
	const withFixed = groups.filter((g) => g.fixedAt > 0);
	return {
		groups: groups.length,
		withFixed: withFixed.length,
		balances: withFixed.filter((g) => g.balances).length,
		damaged: withFixed.filter((g) => !g.balances && g.damaged).length,
		fails: withFixed.filter((g) => !g.balances && !g.damaged).length,
	};
}

export interface LedgerGroup {
	index: number;
	cords: Cord[];
	values: (number | null)[];
	/** where the fixed value sits in the group, or -1 */
	fixedAt: number;
	/** the first cord read as the total */
	total: number | null;
	/** sum of every cord after the first */
	rest: number;
	/** total === fixed + everything else, exactly */
	balances: boolean;
	/** a cord in the group is truncated, so a failed balance is not a failed sum */
	damaged: boolean;
}

/**
 * Read a khipu as an Inkawasi-style ledger: in each group the first cord is a
 * total, one cord carries a fixed value, and the remaining cords account for
 * the rest (Urton & Chu 2019; Clindaniel 2019).
 */
export function ledgerGroups(khipu: Khipu, fixed: number): LedgerGroup[] {
	return pendantGroups(khipu).map((cords, index) => {
		const values = cords.map((c) => c.value);
		const fixedAt = values.indexOf(fixed);
		const total = values[0] ?? null;
		const rest = values.slice(1).reduce<number>((a, v) => a + (v ?? 0), 0);
		const balances =
			total != null && total > 0 && fixedAt > 0 && total === rest;
		return {
			index,
			cords,
			values,
			fixedAt,
			total,
			rest,
			balances,
			damaged: cords.some(isTruncated),
		};
	});
}

/** Values (above a floor) that two khipus have in common. */
export function sharedValues(a: Khipu, b: Khipu, min = 20): Set<number> {
	const pick = (k: Khipu) =>
		new Set(
			k.cords
				.filter((c) => c.kind === "pendant" && c.value != null && c.value > min)
				.map((c) => c.value as number),
		);
	const A = pick(a);
	return new Set([...pick(b)].filter((v) => A.has(v)));
}

/**
 * Six-cord groups of a Santa Valley khipu: level-1 pendants chunked in sixes,
 * skipping the interleaved top cords and the recorder's singleton groups
 * (Medrano & Urton 2018 count 133 such groups across the six khipus).
 */
export function sextets(khipu: Khipu): Cord[][] {
	const sizes = new Map<number, number>();
	for (const c of khipu.cords) {
		if (c.kind !== "pendant") continue;
		sizes.set(c.group ?? -1, (sizes.get(c.group ?? -1) ?? 0) + 1);
	}
	const pend = khipu.cords.filter(
		(c) => c.kind === "pendant" && (sizes.get(c.group ?? -1) ?? 0) > 1,
	);
	const out: Cord[][] = [];
	for (let i = 0; i < pend.length; i += 6) out.push(pend.slice(i, i + 6));
	return out;
}

/**
 * A copy of the khipu holding only the cords that pass the test (and their
 * descendants), so a story can draw a few groups at a readable scale.
 */
export function sliceKhipu(khipu: Khipu, keep: (c: Cord) => boolean): Khipu {
	const kept = new Set<string>();
	for (const c of khipu.cords) if (c.level === 1 && keep(c)) kept.add(c.name);
	// descendants follow their pendant
	let grew = true;
	while (grew) {
		grew = false;
		for (const c of khipu.cords) {
			if (!kept.has(c.name) && c.parent && kept.has(c.parent)) {
				kept.add(c.name);
				grew = true;
			}
		}
	}
	return { ...khipu, cords: khipu.cords.filter((c) => kept.has(c.name)) };
}

/** Decimal places a cord's knots occupy, highest first, for the cord reader. */
export function placeValues(
	c: Cord,
): { place: number; knots: Cord["knots"] }[] {
	const byPlace = new Map<number, Cord["knots"]>();
	for (const k of c.knots) {
		if (k.value == null || k.value === 0) continue;
		const place = 10 ** Math.floor(Math.log10(k.value / Math.max(1, k.n)));
		if (!byPlace.has(place)) byPlace.set(place, []);
		byPlace.get(place)?.push(k);
	}
	return [...byPlace.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([place, knots]) => ({ place, knots }));
}
