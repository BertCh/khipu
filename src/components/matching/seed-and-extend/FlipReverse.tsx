import { useMemo, useState } from "react";
import DotPlot, { type DotPlotRun } from "#/components/matching/DotPlot";
import {
	DEFAULT_SEED_OPTIONS,
	dotPlot,
	seedTrace,
} from "#/lib/matching/seedTrace";

/**
 * Step 6's figure: one khipu tied, or recorded, from the other end of
 * another. The dots (`dotPlot`) never move; flipping B's axis is the same
 * transform `seedTrace`'s `reverseB` applies before scanning — so the exact
 * spans a forward pass and a reversed pass find (both computed live here)
 * line up with what the picture shows.
 */
export function FlipReverse({
	a,
	b,
	aLabel,
	bLabel,
	width = 340,
	height = 340,
}: {
	a: number[];
	b: number[];
	aLabel: string;
	bLabel: string;
	width?: number;
	height?: number;
}) {
	const [flipped, setFlipped] = useState(false);
	const dots = useMemo(() => dotPlot(a, b), [a, b]);
	const fwd = useMemo(
		() => seedTrace(a, b, { ...DEFAULT_SEED_OPTIONS, reverseB: false }),
		[a, b],
	);
	const rev = useMemo(
		() => seedTrace(a, b, { ...DEFAULT_SEED_OPTIONS, reverseB: true }),
		[a, b],
	);
	const runs: DotPlotRun[] = useMemo(
		() =>
			(flipped ? rev.spans : fwd.spans).map(([len, ai, bj]) => ({
				ai,
				bj,
				len,
			})),
		[flipped, fwd, rev],
	);
	const fwdLongest = fwd.spans[0]?.[0] ?? 0;
	const revLongest = rev.spans[0]?.[0] ?? 0;

	return (
		<div className="sae-flip">
			<button
				type="button"
				className="btn sae-flip-btn"
				aria-pressed={flipped}
				onClick={() => setFlipped((f) => !f)}
			>
				{flipped ? `Reading ${bLabel} backward` : `Flip ${bLabel}`}
			</button>
			<DotPlot
				a={a}
				b={b}
				dots={dots}
				runs={runs}
				flipB={flipped}
				width={width}
				height={height}
				aLabel={aLabel}
				bLabel={flipped ? `${bLabel} (reversed)` : bLabel}
			/>
			<p className="sae-flip-stats" aria-live="polite">
				{flipped ? (
					<>
						B reversed: longest shared run {revLongest}
						{revLongest > 0 && (
							<>
								{" "}
								—{" "}
								{rev.spans
									.slice(0, 2)
									.map((s) => s[0])
									.join(" and ")}{" "}
								cords
							</>
						)}
						.
					</>
				) : (
					<>
						Forward: longest shared run {fwdLongest}
						{fwdLongest === 0 && " — the scan finds nothing to extend"}.
					</>
				)}
			</p>
		</div>
	);
}

export default FlipReverse;
