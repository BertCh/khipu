/**
 * Chapter-only helper for /matching/seed-and-extend: names *why* a window of
 * four or five tape values passes or fails
 * src/lib/engine/tests/passages.ts's `informative5` / `informative4`, for the
 * sliding-window figure's caption.
 *
 * The pass/fail boolean always comes from calling `informative5`/`informative4`
 * directly — this file never re-decides it. `diagnose4` only *narrates* the
 * same rule, walking each check in the exact order `informative4`'s loop
 * does (zero at this position, then a repeat against an earlier position in
 * the window, then the max), so the reason named is the reason the real
 * function would have stopped at. `diagnose5` mirrors `informative5`'s two
 * checks (nonzero-count-or-max, then distinct-count) the same way.
 */
import { informative4, informative5 } from "../../engine/tests/passages.ts";

export type WindowSize = 4 | 5;

export interface WindowDiag {
	start: number;
	W: WindowSize;
	values: number[];
	informative: boolean;
	nonzero: number;
	distinct: number;
	max: number;
	/** one line naming the rule that passed, or the first one that failed */
	reason: string;
}

function distinctCount(values: number[]): number {
	return new Set(values).size;
}

function diagnose5(
	values: number[],
	minMax: number,
): Pick<WindowDiag, "nonzero" | "distinct" | "max" | "reason"> {
	const nonzero = values.filter((v) => v !== 0).length;
	const max = Math.max(...values);
	const distinct = distinctCount(values);
	if (nonzero < 4)
		return {
			nonzero,
			distinct,
			max,
			reason: `only ${nonzero} of 5 cords are nonzero — needs 4`,
		};
	if (max < minMax)
		return {
			nonzero,
			distinct,
			max,
			reason: `largest value is ${max}, under ${minMax}`,
		};
	if (distinct < 4)
		return {
			nonzero,
			distinct,
			max,
			reason: `only ${distinct} distinct values — needs 4`,
		};
	return {
		nonzero,
		distinct,
		max,
		reason: `${nonzero} nonzero, ${distinct} distinct, max ${max}`,
	};
}

function diagnose4(
	values: number[],
	minMax: number,
): Pick<WindowDiag, "nonzero" | "distinct" | "max" | "reason"> {
	const nonzero = values.filter((v) => v !== 0).length;
	const max = Math.max(...values);
	for (let k = 0; k < values.length; k++) {
		if (values[k] === 0) {
			return {
				nonzero,
				distinct: distinctCount(values),
				max,
				reason: `cord ${k + 1} of the window is empty — any zero breaks the rule`,
			};
		}
		for (let q = 0; q < k; q++) {
			if (values[q] === values[k]) {
				return {
					nonzero,
					distinct: distinctCount(values),
					max,
					reason: `${values[k]} repeats, cords ${q + 1} and ${k + 1} of the window`,
				};
			}
		}
	}
	const distinct = distinctCount(values);
	if (max < minMax)
		return {
			nonzero,
			distinct,
			max,
			reason: `largest value is ${max}, under ${minMax}`,
		};
	return {
		nonzero,
		distinct,
		max,
		reason: `all ${values.length} nonzero and distinct, max ${max}`,
	};
}

export function diagnoseWindow(
	values: ArrayLike<number>,
	start: number,
	W: WindowSize,
	minMax: number,
): WindowDiag {
	const win: number[] = [];
	for (let k = 0; k < W; k++) win.push(Number(values[start + k]));
	const informative =
		W === 5
			? informative5(values, start, minMax)
			: informative4(values, start, minMax);
	const d = W === 5 ? diagnose5(win, minMax) : diagnose4(win, minMax);
	return { start, W, values: win, informative, ...d };
}

/** Every window of size `W` along `values`, in order. */
export function windowDiagnostics(
	values: ArrayLike<number>,
	W: WindowSize,
	minMax: number,
): WindowDiag[] {
	const out: WindowDiag[] = [];
	for (let i = 0; i + W <= values.length; i++)
		out.push(diagnoseWindow(values, i, W, minMax));
	return out;
}
