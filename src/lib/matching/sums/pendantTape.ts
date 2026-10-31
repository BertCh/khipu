/**
 * Chapter 4 ("Sums inside a khipu") reads a khipu two ways at once: as
 * `tapeOf` does (src/lib/matching/tape.ts — ordinal order, for every
 * NumberTape) and as `pendantValues` does (src/lib/stories/chance.ts —
 * group-then-ordinal order, excluding top cords, the order `pendantSums`
 * actually runs on). On every khipu this chapter uses (KH0081, KH0698,
 * KH0192, KH0469, KH0517, KH0502) the two coincide: none carries a top cord,
 * and every cord's group already rises with its ordinal, so sorting by
 * (group, ordinal) gives the same sequence as sorting by ordinal alone. That
 * identity is checked here, not assumed, so a figure can never silently
 * point at the wrong tile for a sum.
 */
import type { Khipu } from "#/lib/khipu/types";
import { type TapeCord, tapeOf } from "#/lib/matching/tape";
import { pendantValues } from "#/lib/stories/chance";

export interface PendantTape {
	/** display tiles, in the same order `pendantValues` computed `values` in */
	cords: TapeCord[];
	/** exactly `pendantValues(k)` */
	values: number[];
}

export function pendantTape(k: Khipu): PendantTape {
	const cords = tapeOf(k);
	const values = pendantValues(k);
	const same =
		cords.length === values.length &&
		cords.every((c, i) => c.value === values[i]);
	if (!same) {
		throw new Error(
			`${k.id}: tapeOf and pendantValues disagree in order or values — ` +
				"this chapter's figures assume they line up (true for its six khipus) " +
				"and cannot safely point a tile at a sum otherwise.",
		);
	}
	return { cords, values };
}
