import type { WeavePair, WeaveRange } from "#/components/story/StrandWeave";
import type { Cord, Khipu } from "#/lib/khipu/types";
import type { ThreadKind } from "#/lib/stories/strands";
import {
	PARTS,
	type SummaryRow,
	VERDICT_TEXT,
	type Verdict,
} from "#/lib/stories/tiedtwice";

/**
 * Helpers that prepare the network's weave for a story: cord positions in the
 * weave's indexing, cord ranges of groups, and threads a story draws from its
 * own reading instead of strands.json.
 *
 * The weave (like the silhouettes and strands.json) indexes a khipu's level-1
 * cords, 0-based, in recorded order.
 */

/** name → level-1 index, the weave's cord indexing */
export function l1Index(khipu: Khipu): Map<string, number> {
	const l1 = khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
	return new Map(l1.map((c, i) => [c.name, i]));
}

/** the level-1 index of a cord (-1 when it is not a level-1 cord) */
export function cordAt(index: Map<string, number>, cord: Cord | null): number {
	return cord ? (index.get(cord.name) ?? -1) : -1;
}

/** cords [from, to) of recorded groups `first`..`last` (0-based, inclusive) */
export function groupSpan(
	khipu: Khipu,
	first: number,
	last = first,
): WeaveRange {
	const index = l1Index(khipu);
	const at = khipu.cords
		.filter(
			(c) =>
				c.level === 1 && (c.group ?? -1) >= first && (c.group ?? -1) <= last,
		)
		.map((c) => index.get(c.name) ?? 0);
	return {
		id: khipu.id,
		from: Math.min(...at),
		to: Math.max(...at) + 1,
	};
}

/** one of AS175's three parts as a cord range */
export function partSpan(as175: Khipu, key: "1" | "2" | "3"): WeaveRange {
	const p = PARTS.find((x) => x.key === key) ?? PARTS[0];
	return groupSpan(as175, p.from, p.to);
}

const SUM_KIND: Record<Verdict, ThreadKind> = {
	exact: "sum",
	one: "near",
	ten: "differ",
	register: "differ",
	no: "differ",
	na: "differ",
};

/**
 * The summary test of "An account tied twice" as threads: each of AS175's
 * fifteen part-2 cords, fanned to the seven UR232 cords whose values the
 * Aschers' rule adds into it. A thread is a sum only where UR232's terms add
 * up to the summary cord exactly; off by one is near; anything else differs.
 */
export function summaryThreads(
	as175: Khipu,
	ur232: Khipu,
	rows: SummaryRow[],
): WeavePair {
	const ia = l1Index(as175);
	const ib = l1Index(ur232);
	return {
		a: as175.id,
		b: ur232.id,
		threads: rows.map((r) => {
			const kind = SUM_KIND[r.verdictB];
			return {
				a: [cordAt(ia, r.target)],
				b: r.terms.map((t) => cordAt(ib, t.b)).filter((i) => i >= 0),
				va: r.target.value ?? 0,
				vb: r.sumB,
				kind,
				how:
					kind === "sum"
						? undefined
						: `the seven UR232 terms add to ${r.sumB.toLocaleString()}: ${VERDICT_TEXT[r.verdictB]}`,
				note: `AS175's own terms add to ${r.sumA.toLocaleString()} (${VERDICT_TEXT[r.verdictA]})`,
			};
		}),
	};
}
