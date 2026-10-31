import { useMemo } from "react";
import NumberTape, { type TileState } from "#/components/matching/NumberTape";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable } from "#/lib/khipu/types";
import { startsTried } from "#/lib/matching/sums/targetSteps";
import type { SumStep } from "#/lib/matching/sumTrace";
import type { TapeCord } from "#/lib/matching/tape";

const COLOR_OP_RE = /[:\-%^]/;
const swatch = (color: string | null, colors: ColorTable) =>
	hexFor(color ? color.split(COLOR_OP_RE)[0] : undefined, colors);

interface Attempt {
	s: number;
	cords: number[];
	runningBy: number[];
	final: number;
	outcome: "growing" | "equal" | "miss";
}

/** Replays `steps` up to (and including) `upto` into the attempt currently on screen and every attempt before it. */
function deriveAttempts(steps: readonly SumStep[], upto: number): Attempt[] {
	const attempts: Attempt[] = [];
	let cur: Attempt | null = null;
	for (let k = 0; k <= upto && k < steps.length; k++) {
		const st = steps[k];
		if (st.kind === "tryStart") {
			cur = { s: st.s, cords: [], runningBy: [], final: 0, outcome: "growing" };
			attempts.push(cur);
		} else if (st.kind === "add" && cur) {
			cur.cords.push(st.cord);
			cur.runningBy.push(st.running);
			cur.final = st.running;
		} else if (st.kind === "outcome" && cur) {
			cur.outcome = st.result === "equal" ? "equal" : "miss";
		}
	}
	return attempts;
}

export interface SumGrowthProps {
	cords: TapeCord[];
	colors: ColorTable;
	/** this target's own step slice, from `stepsForTarget` */
	steps: SumStep[];
	targetI: number;
	targetValue: number;
}

/**
 * One target cord's search, replayed: a local strip of the tape, and a
 * stacked bar that grows one cord at a time toward a dashed target line —
 * landing on it exactly (a hit) or passing it (a miss, so the search moves
 * its start on). Source: src/lib/matching/sumTrace.ts, which instruments
 * src/lib/stories/chance.ts's `pendantSums`.
 */
export default function SumGrowth({
	cords,
	colors,
	steps,
	targetI,
	targetValue,
}: SumGrowthProps) {
	const starts = useMemo(() => startsTried(steps), [steps]);
	const ticks = useMemo(
		() =>
			steps
				.map((s, k) => (s.kind === "tryStart" ? k : -1))
				.filter((k) => k >= 0),
		[steps],
	);
	const state = useTrace(steps.length, {
		fps: 2.4,
		reducedStep: steps.length - 1,
	});
	const attempts = useMemo(
		() => deriveAttempts(steps, state.step),
		[steps, state.step],
	);
	const current = attempts[attempts.length - 1] ?? null;
	const hit = attempts.find((a) => a.outcome === "equal") ?? null;

	const lo = Math.max(0, Math.min(targetI, ...starts.map((s) => s - 1)) - 1);
	const hi = Math.min(
		cords.length,
		Math.max(targetI, ...starts, ...(hit?.cords ?? [])) + 2,
	);
	const windowCords = cords.slice(lo, hi);

	const tileState = (i: number): TileState => {
		if (i === targetI) return "focus";
		if (hit?.cords.includes(i)) return "run";
		if (current && current !== hit && current.cords.includes(i))
			return current.outcome === "miss" ? "mismatch" : "window";
		return "dim";
	};

	const domainMax = useMemo(
		() => Math.max(targetValue, ...attempts.map((a) => a.final), 1) * 1.08,
		[attempts, targetValue],
	);
	const barW = 560;
	const barH = 34;
	const scale = (v: number) => (v / domainMax) * barW;
	const targetX = scale(targetValue);

	let runningX = 0;
	const segs = (current?.cords ?? []).map((cordI, k) => {
		const from = runningX;
		const val = cords[cordI]?.value ?? 0;
		runningX += scale(val);
		return {
			cordI,
			from,
			w: scale(val) - (k < (current?.cords.length ?? 0) - 1 ? 1 : 0),
			val,
		};
	});

	const attemptNo = attempts.length;
	const totalAttempts = starts.length;
	const stepKind = steps[state.step]?.kind;

	return (
		<div className="trace-figure sum-growth">
			<TracePlayer
				state={state}
				ticks={ticks}
				label="Sum growth"
				caption={
					current ? (
						<>
							Try <strong>{attemptNo}</strong> of {totalAttempts}: starting at
							cord {cords[current.s]?.name}, running total{" "}
							<strong>{current.final}</strong> against target{" "}
							<strong>{targetValue}</strong>
							{current.outcome === "equal" && " — equal: recorded."}
							{current.outcome === "miss" &&
								current.final > targetValue &&
								" — passed the target: this start is dropped."}
							{stepKind === "target" && " Starting the search."}
						</>
					) : (
						"Starting the search."
					)
				}
			>
				<NumberTape
					cords={windowCords}
					colors={colors}
					label={`cords ${lo} to ${hi - 1} of the tape, target cord highlighted`}
					state={tileState}
				/>
				<div className="mtx-scroll">
					<svg
						className="sum-bar"
						width={barW + 16}
						height={barH + 28}
						viewBox={`0 0 ${barW + 16} ${barH + 28}`}
						role="img"
						aria-label={`Running sum ${current?.final ?? 0} against target ${targetValue}`}
					>
						<rect
							x={0}
							y={4}
							width={barW}
							height={barH}
							className="sum-bar-track"
						/>
						{segs.map((s) => (
							<g key={s.cordI}>
								<rect
									x={s.from}
									y={4}
									width={Math.max(0, s.w)}
									height={barH}
									fill={swatch(cords[s.cordI]?.color ?? null, colors)}
									className="sum-bar-seg"
								/>
								{s.w > 14 && (
									<text
										x={s.from + s.w / 2}
										y={4 + barH / 2 + 3}
										textAnchor="middle"
										className="sum-bar-val"
									>
										{s.val}
									</text>
								)}
							</g>
						))}
						<line
							x1={targetX}
							x2={targetX}
							y1={-2}
							y2={barH + 10}
							className="sum-bar-target"
						/>
						<text
							x={targetX}
							y={barH + 24}
							textAnchor="middle"
							className="sum-bar-target-label"
						>
							target {targetValue}
						</text>
						{current && current.final > 0 && (
							<text
								x={Math.min(barW, scale(current.final)) + 4}
								y={-6 + 14}
								className="sum-bar-running"
							>
								{current.final}
							</text>
						)}
					</svg>
				</div>
			</TracePlayer>
			<p className="muted">
				Source: src/lib/matching/sumTrace.ts (relation 1,
				src/lib/stories/chance.ts)
			</p>
		</div>
	);
}
