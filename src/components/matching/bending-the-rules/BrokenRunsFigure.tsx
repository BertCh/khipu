import NumberTape, { type TileState } from "#/components/matching/NumberTape";
import type { ColorTable } from "#/lib/khipu/types";
import type { BrokenRunsResult } from "#/lib/matching/bending-the-rules/brokenRuns";

/**
 * Two number tapes, one shared run picked out, everything else where the
 * tapes differ marked. Source: src/lib/engine/tests/passages.ts (`pairRun`),
 * src/lib/matching/bending-the-rules/brokenRuns.ts.
 */
export default function BrokenRunsFigure({
	data,
	colors,
}: {
	data: BrokenRunsResult;
	colors: ColorTable;
}) {
	const stateA = (i: number): TileState =>
		data.runA.has(i) ? "run" : data.diffA.has(i) ? "mismatch" : "idle";
	const stateB = (i: number): TileState =>
		data.runB.has(i) ? "run" : data.diffB.has(i) ? "mismatch" : "idle";
	return (
		<div className="btr-tapes">
			<div className="btr-tape-row">
				<span className="btr-tape-label">KH0303</span>
				<NumberTape
					cords={data.tapeA}
					state={stateA}
					colors={colors}
					label={`KH0303, ${data.tapeA.length} cords`}
				/>
			</div>
			<div className="btr-tape-row">
				<span className="btr-tape-label">KH0304</span>
				<NumberTape
					cords={data.tapeB}
					state={stateB}
					colors={colors}
					label={`KH0304, ${data.tapeB.length} cords`}
				/>
			</div>
			<ul className="btr-legend">
				<li>
					<i className="btr-swatch btr-swatch-run" aria-hidden="true" />
					shared run (<code>pairRun</code>)
				</li>
				<li>
					<i className="btr-swatch btr-swatch-mismatch" aria-hidden="true" />
					where the two tapes differ
				</li>
			</ul>
		</div>
	);
}
