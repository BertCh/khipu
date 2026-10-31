/**
 * Cords whose KFG Value differs from the sum of their knot tokens
 * (scripts/mk/value_knot_conflicts.py; build_data.py value_conflicts()).
 * Node-importable. No null: a count checked against the recorded number.
 *
 * Observed = cords carrying valueConflict at any level (corpus-lite
 * `nConflicts`); detail.khipus = khipus with the VALUE_CONFLICT flag.
 * `kv` (the knot-derived values the "knots" source applies) holds only the
 * level-1 ones: 72 of the 104 on 38 khipus; the other 32 sit on subsidiaries.
 */
import type { Executor, Hit } from "../../next/types.ts";
import { FLAG } from "../../next/types.ts";
import { hasFlag } from "../corpus.ts";

export const valueConflictsExec: Executor = {
	scope: "corpus",
	nullKind: "none",
	observe(c) {
		const hits: Hit[] = [];
		let cords = 0;
		let levelOne = 0;
		let flagged = 0;
		let kvKhipus = 0;
		for (const k of c.khipus) {
			const f = hasFlag(k, FLAG.VALUE_CONFLICT);
			if (f) flagged++;
			if (k.kv.size) kvKhipus++;
			cords += k.nConflicts;
			levelOne += k.kv.size;
			if (f || k.nConflicts)
				hits.push({
					ids: [k.id],
					at: [[...k.kv.keys()]],
					value: k.nConflicts,
				});
		}
		return {
			value: cords,
			hits,
			detail: {
				khipus: flagged,
				levelOneCords: levelOne,
				levelOneKhipus: kvKhipus,
			},
		};
	},
};
