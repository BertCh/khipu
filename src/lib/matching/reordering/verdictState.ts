import type { Verdict } from "#/lib/stories/tiedtwice";

/** Mirrors NumberTape's TileState without importing the component (keeps this file DOM-free). */
export type VerdictTileState = "run" | "slip" | "mismatch" | "gap";

/**
 * How a field's verdict (src/lib/stories/tiedtwice.ts verdictOf) borrows a
 * NumberTape tile state: exact reuses "run" (the solid highlight a confirmed
 * run gets elsewhere in the series), a forgivable near-miss (one digit, a
 * ten, a register) reuses "slip", an outright disagreement reuses
 * "mismatch", and a missing or blank cord reuses "gap".
 */
export function verdictTileState(v: Verdict): VerdictTileState {
	if (v === "exact") return "run";
	if (v === "no") return "mismatch";
	if (v === "na") return "gap";
	return "slip";
}
