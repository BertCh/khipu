import { useMemo } from "react";
import NumberTape from "#/components/matching/NumberTape";
import { TracePlayer } from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { ColorTable, Cord } from "#/lib/khipu/types";
import {
	insertionSortTrace,
	type SortTrace,
} from "#/lib/matching/reordering/sort";
import type { TapeCord } from "#/lib/matching/tape";

function baseTape(cords: readonly Cord[]): TapeCord[] {
	return cords.map((c, i) => ({
		i,
		value: c.value ?? 0,
		group: 0,
		color: c.color,
		name: c.name,
	}));
}

function Row({
	base,
	trace,
	step,
	colors,
	label,
}: {
	base: TapeCord[];
	trace: SortTrace;
	step: number;
	colors: ColorTable;
	label: string;
}) {
	const at = trace.steps[Math.min(step, trace.steps.length - 1)];
	const done = step >= trace.steps.length - 1;
	const order = at.order.map((idx) => base[idx]);
	const state = (i: number) => {
		const pos = at.order.indexOf(i);
		if (at.compare && (pos === at.compare[0] || pos === at.compare[1]))
			return at.swapped ? "seed" : "focus";
		if (done) return "run";
		return "idle";
	};
	return (
		<NumberTape
			cords={order}
			state={state}
			colors={colors}
			tile={24}
			groupGap={3}
			label={label}
		/>
	);
}

/**
 * Two groups that hold the same nine values in a different order, sorted
 * live to their shared signature (a textbook insertion sort, one step per
 * comparison), so the reader watches them converge on the same sequence.
 */
export default function GroupSortFigure({
	groupA,
	groupB,
	aliasA,
	aliasB,
	colors,
}: {
	groupA: Cord[];
	groupB: Cord[];
	aliasA: string;
	aliasB: string;
	colors: ColorTable;
}) {
	const baseA = useMemo(() => baseTape(groupA), [groupA]);
	const baseB = useMemo(() => baseTape(groupB), [groupB]);
	const traceA = useMemo(
		() => insertionSortTrace(groupA.map((c) => c.value ?? 0)),
		[groupA],
	);
	const traceB = useMemo(
		() => insertionSortTrace(groupB.map((c) => c.value ?? 0)),
		[groupB],
	);
	const nSteps = Math.max(traceA.steps.length, traceB.steps.length);
	const state = useTrace(nSteps, { fps: 2.5 });
	const i = state.step;
	const doneA = i >= traceA.steps.length - 1;
	const doneB = i >= traceB.steps.length - 1;
	const bothDone = doneA && doneB;
	const cA = traceA.steps[Math.min(i, traceA.steps.length - 1)];
	const cB = traceB.steps[Math.min(i, traceB.steps.length - 1)];
	const sortedValues = bothDone
		? cA.order.map((idx) => groupA[idx].value ?? 0)
		: null;

	return (
		<TracePlayer
			state={state}
			label="Sort"
			ticks={[0, traceA.steps.length - 1, traceB.steps.length - 1].filter(
				(t, idx, arr) => t > 0 && arr.indexOf(t) === idx,
			)}
			caption={
				bothDone ? (
					<>
						Both sorted: <strong>{sortedValues?.join(" · ")}</strong> — the same
						nine values, the same order, because they are the same multiset.
						{aliasA}: {cA.comparisons} comparisons, {cA.swaps} swaps. {aliasB}:{" "}
						{cB.comparisons} comparisons, {cB.swaps} swaps.
					</>
				) : (
					<>
						{aliasA}: {cA.comparisons} comparisons, {cA.swaps} swaps so far.{" "}
						{aliasB}: {cB.comparisons} comparisons, {cB.swaps} swaps so far.
					</>
				)
			}
		>
			<div className={`reorder-sort-player${bothDone ? " is-matched" : ""}`}>
				<Row
					base={baseA}
					trace={traceA}
					step={i}
					colors={colors}
					label={aliasA}
				/>
				<Row
					base={baseB}
					trace={traceB}
					step={i}
					colors={colors}
					label={aliasB}
				/>
			</div>
		</TracePlayer>
	);
}
