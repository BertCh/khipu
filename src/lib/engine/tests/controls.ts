/**
 * Controls for the pair test, both built on the Paris–Lima pair
 * (KH0097, KH0586). Node-importable.
 *
 * - decoy (negative): KH0097 against a seeded whole-sequence shuffle of
 *   KH0586 (seed 777). Any real signal is destroyed, so the pair test must
 *   find nothing beyond chance.
 * - planted (positive): the same shuffle of KH0586, with KH0097's longest
 *   exact shared run with KH0586 (found by the passage scan, links.json
 *   [6, 174, 179]) written back in at its KH0586 position. The pair test must
 *   find it.
 */
import type { CorpusLite, Executor, KhipuLite } from "../../next/types.ts";
import { cloneLite } from "../corpus.ts";
import { mulberry32, shuffleInPlace } from "../rng.ts";
import { pairExecFrom } from "./pair.ts";
import { pairRun } from "./passages.ts";

export const CONTROL_A = "KH0097";
export const CONTROL_B = "KH0586";
export const CONTROL_SEED = 777;

function need(c: CorpusLite, id: string): KhipuLite {
	const k = c.byId.get(id);
	if (!k) throw new Error(`no khipu ${id} in the corpus`);
	return k;
}

/** KH0586 with its level-1 sequence shuffled by mulberry32(777) */
export function decoyB(c: CorpusLite): KhipuLite {
	const b = cloneLite(need(c, CONTROL_B));
	shuffleInPlace(b.seq, mulberry32(CONTROL_SEED));
	return b;
}

/** the decoy B with the pair's longest exact run planted back at its place */
export function plantedB(c: CorpusLite): KhipuLite {
	const A = need(c, CONTROL_A);
	const B = need(c, CONTROL_B);
	const run = pairRun(A.seq, B.seq);
	const b = decoyB(c);
	const span = run.spans[0];
	if (!span) return b;
	const [len, i, j] = span;
	for (let t = 0; t < len; t++) {
		// a reversed run lies backwards on B
		b.seq[j + t] = run.dir === "rev" ? A.seq[i + len - 1 - t] : A.seq[i + t];
	}
	return b;
}

export const decoyExec: Executor = pairExecFrom(CONTROL_A, CONTROL_B, decoyB);
export const plantedExec: Executor = pairExecFrom(
	CONTROL_A,
	CONTROL_B,
	plantedB,
);
