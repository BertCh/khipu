import { useMemo, useState } from "react";
import DotPlot, { type DotPlotRun } from "#/components/matching/DotPlot";
import { dotPlot, seedTrace, type WindowSize } from "#/lib/matching/seedTrace";

export interface DotterPair {
	id: string;
	a: number[];
	b: number[];
	aLabel: string;
	bLabel: string;
	width: number;
	height: number;
}

type WChoice = WindowSize | "5+4";

/**
 * Step 5's figure: a Dotter-style stringency control on the dot plot. Dots
 * (`dotPlot`, src/lib/matching/seedTrace.ts) never change — they are every
 * cell where the two tapes hold the same nonzero value. The diagonal strokes
 * are `seedTrace(a, b, opts).spans`, recomputed on every change to window
 * width or the minimum-maximum threshold, so loosening the filter visibly
 * grows spurious runs and tightening it prunes them.
 */
export function DotterFigure({ pairs }: { pairs: DotterPair[] }) {
	const [pairIndex, setPairIndex] = useState(0);
	const [W, setW] = useState<WChoice>("5+4");
	const [minMax, setMinMax] = useState(15);
	const pair = pairs[pairIndex];

	const dots = useMemo(() => dotPlot(pair.a, pair.b), [pair.a, pair.b]);
	const runs = useMemo<DotPlotRun[]>(() => {
		const st = seedTrace(pair.a, pair.b, { W, minMax });
		return st.spans.map(([len, ai, bj]) => ({ ai, bj, len }));
	}, [pair.a, pair.b, W, minMax]);
	const longest = runs.length ? Math.max(...runs.map((r) => r.len)) : 0;

	return (
		<div className="sae-dotter">
			<fieldset className="diagram-tools sae-dotter-tools">
				<legend className="sr-only">Pair and stringency</legend>
				<div className="sae-dotter-row">
					{pairs.map((p, i) => (
						<button
							key={p.id}
							type="button"
							className="btn"
							aria-pressed={pairIndex === i}
							onClick={() => setPairIndex(i)}
						>
							{p.aLabel} / {p.bLabel}
						</button>
					))}
				</div>
				<div className="sae-dotter-row">
					<span className="sae-dotter-label">Window</span>
					{(["5+4", 5, 4] as const).map((w) => (
						<button
							key={w}
							type="button"
							className="btn"
							aria-pressed={W === w}
							onClick={() => setW(w)}
						>
							{w === "5+4" ? "5 + 4" : `${w} only`}
						</button>
					))}
					<label className="sae-dotter-slider">
						<span className="sae-dotter-label">Max value ≥ {minMax}</span>
						<input
							type="range"
							min={0}
							max={50}
							step={5}
							value={minMax}
							onChange={(e) => setMinMax(Number(e.target.value))}
						/>
					</label>
				</div>
			</fieldset>
			<DotPlot
				a={pair.a}
				b={pair.b}
				dots={dots}
				runs={runs}
				width={pair.width}
				height={pair.height}
				aLabel={pair.aLabel}
				bLabel={pair.bLabel}
			/>
			<p className="sae-dotter-stats" aria-live="polite">
				{dots.length} cells where a value repeats · {runs.length} run
				{runs.length === 1 ? "" : "s"} pass the filter
				{runs.length > 0 && <>, longest {longest}</>}.
			</p>
		</div>
	);
}

export default DotterFigure;
