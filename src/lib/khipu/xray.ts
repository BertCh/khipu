import { levelOneCords } from "./fieldmarks";
import type { Cord, KhipuLike } from "./types";

/**
 * The x-ray grid: one column per cord group, one row per cord in the group,
 * pendants counting down from the primary cord and top cords counting up.
 * Shared by the big x-ray and the thumbnail in each sum-table row so a cord
 * lands in the same place in both.
 */

export interface XrayCell {
	cord: Cord;
	/** column, in group order (ungrouped cords last) */
	col: number;
	/** 0 is the first pendant below the primary cord; top cords are -1, -2, … */
	row: number;
}

export interface XrayGrid {
	cells: Map<string, XrayCell>;
	/** group index (into khipu.groups) per column, -1 for the ungrouped column */
	groupOf: number[];
	nCols: number;
	rowsDown: number;
	rowsUp: number;
	/** level-1 cords in khipu order */
	n: number;
}

export function xrayGrid(khipu: KhipuLike): XrayGrid {
	const seq = levelOneCords(khipu);
	const cells = new Map<string, XrayCell>();
	const groupOf: number[] = [];
	const colOf = new Map<number, number>();
	const down: number[] = [];
	const up: number[] = [];
	for (const c of seq) {
		const gi = c.group ?? -1;
		let col = colOf.get(gi);
		if (col === undefined) {
			col = groupOf.length;
			colOf.set(gi, col);
			groupOf.push(gi);
			down.push(0);
			up.push(0);
		}
		if (c.kind === "top") {
			up[col] += 1;
			cells.set(c.name, { cord: c, col, row: -up[col] });
		} else {
			cells.set(c.name, { cord: c, col, row: down[col] });
			down[col] += 1;
		}
	}
	return {
		cells,
		groupOf,
		nCols: groupOf.length,
		rowsDown: Math.max(0, ...down),
		rowsUp: Math.max(0, ...up),
		n: seq.length,
	};
}
