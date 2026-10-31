import { useMemo } from "react";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import { prefixSearch } from "#/lib/matching/sums/prefixSearch";
import type { TapeCord } from "#/lib/matching/tape";

export interface PrefixSearchFigureProps {
	cords: TapeCord[];
	values: number[];
	/** the target cord's tape index */
	targetI: number;
	/** the start this search is for (already known to succeed) */
	start: number;
}

const W = 600;
const TRACK_Y = 30;

/**
 * The search `oneSide` actually runs once it has picked a start `s`: not a
 * cord-by-cord growth (that is Figure 1, `SumGrowth`) but a halving search
 * over the prefix-sum array for the first index whose cumulative total meets
 * the target. Source: `lowerBound` in src/lib/stories/chance.ts, mirrored in
 * src/lib/matching/sums/prefixSearch.ts.
 */
export default function PrefixSearchFigure({
	cords,
	values,
	targetI,
	start,
}: PrefixSearchFigureProps) {
	const t = values[targetI];
	const { pf, target, steps, e } = useMemo(
		() => prefixSearch(values, start, t),
		[values, start, t],
	);
	const state = useTrace(steps.length, {
		fps: 1,
		reducedStep: steps.length - 1,
	});
	const n = pf.length - 1;
	const x = (idx: number) => (idx / n) * W;

	const step = steps[state.step];
	const cordByCord = e - start;

	return (
		<div className="trace-figure prefix-search">
			<TracePlayer
				state={state}
				label="Prefix search"
				caption={
					step ? (
						<>
							Looking at index {step.mid}: prefix sum{" "}
							{step.value.toLocaleString()}
							{step.value < target ? (
								<>
									{" "}
									is below {target.toLocaleString()} — search the half above it.
								</>
							) : (
								<>
									{" "}
									is at or above {target.toLocaleString()} — search this half or
									below.
								</>
							)}
							{step.done && (
								<>
									{" "}
									Narrowed to one index: {e}, prefix sum{" "}
									{pf[e]?.toLocaleString()} — exactly the target.
								</>
							)}
						</>
					) : (
						"Eight comparisons on a tape of 216 cords."
					)
				}
			>
				<div className="mtx-scroll">
					<svg
						width={W + 24}
						height={80}
						viewBox={`0 0 ${W + 24} 80`}
						role="img"
						aria-label={`Binary search over ${n} prefix sums, narrowing to index ${e}`}
					>
						<line
							x1={0}
							x2={W}
							y1={TRACK_Y}
							y2={TRACK_Y}
							className="prefix-track"
						/>
						<text x={0} y={TRACK_Y - 10} className="prefix-tick-label">
							0
						</text>
						<text
							x={W}
							y={TRACK_Y - 10}
							textAnchor="end"
							className="prefix-tick-label"
						>
							{n}
						</text>
						{step && (
							<rect
								x={x(step.lo)}
								y={TRACK_Y - 6}
								width={Math.max(1, x(step.hi) - x(step.lo))}
								height={12}
								className="prefix-bracket"
							/>
						)}
						{step && (
							<g transform={`translate(${x(step.mid)}, ${TRACK_Y})`}>
								<circle
									r={5}
									className={`prefix-mid ${step.done ? "is-found" : step.value < target ? "is-low" : "is-high"}`}
								/>
								<text y={-14} textAnchor="middle" className="prefix-mid-label">
									pf[{step.mid}]={step.value.toLocaleString()}
								</text>
							</g>
						)}
						<text
							x={W}
							y={TRACK_Y + 26}
							textAnchor="end"
							className="prefix-target-label"
						>
							target: pf[{start}] + {t} = {target.toLocaleString()}
						</text>
					</svg>
				</div>
			</TracePlayer>
			<p className="muted">
				Cord-by-cord (Figure 1's method) would add {cordByCord} cords here,{" "}
				{cords[start]?.name} to {cords[e - 1]?.name}, to confirm{" "}
				{cords[targetI]?.name}
				&rsquo;s total of {t}. The prefix-sum lookup takes {steps.length}{" "}
				comparisons, however long that run is.
			</p>
			<p className="muted">
				Source: src/lib/stories/chance.ts (`oneSide`'s `lowerBound`),
				src/lib/matching/sums/prefixSearch.ts
			</p>
		</div>
	);
}
