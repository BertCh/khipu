import { useMemo } from "react";
import NumberTape from "#/components/matching/NumberTape";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { ColorTable } from "#/lib/khipu/types";
import { seedTrace } from "#/lib/matching/seedTrace";
import type { TapeCord } from "#/lib/matching/tape";
import { TileLegend } from "./TileLegend";

const MIN_MAX = 15;
const W = 5;

/**
 * Step 4's figure: the whole seed-and-extend pass over one pair, step by
 * step — window, index, lookup, extend, the maximal run — from one call to
 * `seedTrace` (src/lib/matching/seedTrace.ts). Width 5 only: it already
 * finds this pair's run (step 2 shows width 4's stricter rule).
 */
export function ExtendTrace({
	a,
	b,
	aCords,
	bCords,
	colors,
	aLabel,
	bLabel,
}: {
	a: number[];
	b: number[];
	aCords: TapeCord[];
	bCords: TapeCord[];
	colors: ColorTable;
	aLabel: string;
	bLabel: string;
}) {
	const steps = useMemo(
		() => seedTrace(a, b, { W, minMax: MIN_MAX }).steps,
		[a, b],
	);
	const ticks = useMemo(() => {
		const out: number[] = [];
		const want: Array<"index" | "lookup" | "extend" | "run"> = [
			"index",
			"lookup",
			"extend",
			"run",
		];
		for (const kind of want) {
			const i = steps.findIndex((s) => s.kind === kind);
			if (i >= 0) out.push(i);
		}
		return out;
	}, [steps]);
	const firstRun = steps.findIndex((s) => s.kind === "run");
	const trace = useTrace(steps.length, {
		fps: 3,
		reducedStep: firstRun >= 0 ? firstRun : undefined,
	});
	const cur = steps[trace.step];

	const { aMarks, bMarks } = useMemo(() => {
		const aSeeded = new Set<number>();
		const aTouched = new Set<number>();
		const bSeeded = new Set<number>();
		const bTouched = new Set<number>();
		for (let s = 0; s <= trace.step; s++) {
			const st = steps[s];
			if (st?.kind !== "window") continue;
			const seeded = st.side === "a" ? aSeeded : bSeeded;
			const touched = st.side === "a" ? aTouched : bTouched;
			for (let k = 0; k < st.W; k++) {
				touched.add(st.start + k);
				if (st.informative) seeded.add(st.start + k);
			}
		}
		return {
			aMarks: { seeded: aSeeded, touched: aTouched },
			bMarks: { seeded: bSeeded, touched: bTouched },
		};
	}, [steps, trace.step]);

	const span =
		cur?.kind === "extend"
			? { a0: cur.i, b0: cur.j, len: cur.length }
			: cur?.kind === "run"
				? { a0: cur.i, b0: cur.j, len: cur.len }
				: null;

	const aState = (i: number) => {
		if (span && i >= span.a0 && i < span.a0 + span.len) return "run" as const;
		if (
			cur?.kind === "window" &&
			cur.side === "a" &&
			i >= cur.start &&
			i < cur.start + cur.W
		)
			return "window" as const;
		if (cur?.kind === "lookup" && cur.hits.some((h) => i >= h && i < h + cur.W))
			return "focus" as const;
		if (aMarks.seeded.has(i)) return "seed" as const;
		if (aMarks.touched.has(i)) return "dim" as const;
		return "idle" as const;
	};
	const bState = (i: number) => {
		if (span && i >= span.b0 && i < span.b0 + span.len) return "run" as const;
		if (
			(cur?.kind === "window" &&
				cur.side === "b" &&
				i >= cur.start &&
				i < cur.start + cur.W) ||
			(cur?.kind === "lookup" && i >= cur.start && i < cur.start + cur.W)
		)
			return "window" as const;
		if (bMarks.seeded.has(i)) return "seed" as const;
		if (bMarks.touched.has(i)) return "dim" as const;
		return "idle" as const;
	};

	const caption = (() => {
		if (!cur) return null;
		switch (cur.kind) {
			case "window":
				return cur.side === "a" ? (
					<>
						A: window at cord {cur.start + 1}
						{cur.informative ? " — informative." : " — not informative."}
					</>
				) : (
					<>
						B: window at cord {cur.start + 1}
						{cur.informative ? " — informative." : " — not informative."}
					</>
				);
			case "index":
				return (
					<>
						Indexed: key &ldquo;{cur.key}&rdquo; → A cord {cur.start + 1}.
					</>
				);
			case "lookup":
				return (
					<>
						Seed: B&rsquo;s window at cord {cur.start + 1} matches A at cord{" "}
						{cur.hits.map((h) => h + 1).join(", cord ")}.
					</>
				);
			case "extend":
				return (
					<>
						Extending {cur.dir}: the shared span is now {cur.length} cords (cord{" "}
						{cur.i + 1}–{cur.i + cur.length}).
					</>
				);
			case "run":
				return (
					<>
						Maximal run: {cur.len} cords — {aLabel} cord {cur.i + 1}–
						{cur.i + cur.len} against {bLabel} cord {cur.j + 1}–
						{cur.j + cur.len}. The next cord along disagrees.
					</>
				);
			default:
				return null;
		}
	})();

	return (
		<div className="sae-extend-fig">
			<TracePlayer
				state={trace}
				ticks={ticks}
				speeds={[1, 4, 16]}
				label="Seed and extend"
				caption={caption}
			>
				<div className="sae-extend-tapes">
					<NumberTape
						cords={aCords}
						colors={colors}
						state={aState}
						label={`${aLabel}, ${aCords.length} cords`}
					/>
					<NumberTape
						cords={bCords}
						colors={colors}
						state={bState}
						label={`${bLabel}, ${bCords.length} cords`}
					/>
				</div>
			</TracePlayer>
			<TileLegend
				items={[
					{ state: "idle", label: "not yet reached" },
					{ state: "dim", label: "checked, not informative" },
					{ state: "seed", label: "informative" },
					{ state: "focus", label: "seed match" },
					{ state: "run", label: "confirmed run" },
				]}
			/>
		</div>
	);
}

export default ExtendTrace;
