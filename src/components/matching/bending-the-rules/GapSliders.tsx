import { useId, useMemo, useState } from "react";
import NumberTape from "#/components/matching/NumberTape";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { DEFAULT_SW_PARAMS, swTrace } from "#/lib/matching/swTrace";
import type { TapeCord } from "#/lib/matching/tape";
import { pendantGroups } from "#/lib/stories/derive";
import { unitsOf } from "#/lib/stories/tiedtwice";
import DiffReading from "./DiffReading";

export interface GapSlidersProps {
	k192: Khipu;
	k470: Khipu;
	colors: ColorTable;
	ic: (v: number) => number;
}

/**
 * 0-based, inclusive: AS175's groups 2–7 and UR233's units 2–7. AS175's own
 * first group (index 0) is short a cord (its white pendant is lost), so the
 * window starts one group in, where every group is the full five cords.
 */
const WINDOW_FROM = 1;
const WINDOW_TO = 6;

function toTape(cords: Cord[], unitSize: number): TapeCord[] {
	return cords.map((c, i) => ({
		i,
		value: c.value ?? 0,
		group: Math.floor(i / unitSize),
		color: c.color,
		name: c.name,
	}));
}

/**
 * A window of AS175 (KH0192) against UR233 (KH0470), which restates it with a
 * blank cord added to every six-cord unit (src/lib/stories/tiedtwice.ts). Live
 * sliders for the affine-gap and slip constants re-run swTrace and redraw the
 * path. Source: src/lib/matching/swTrace.ts, src/lib/stories/tiedtwice.ts.
 */
export default function GapSliders({
	k192,
	k470,
	colors,
	ic,
}: GapSlidersProps) {
	const { tapeA, tapeB } = useMemo(() => {
		const groups = pendantGroups(k192).slice(WINDOW_FROM, WINDOW_TO + 1);
		const units = unitsOf(k470, "sixes").slice(WINDOW_FROM, WINDOW_TO + 1);
		return {
			tapeA: toTape(groups.flat(), 5),
			tapeB: toTape(units.flat(), 6),
		};
	}, [k192, k470]);
	const aVals = useMemo(() => tapeA.map((c) => c.value), [tapeA]);
	const bVals = useMemo(() => tapeB.map((c) => c.value), [tapeB]);

	const [go, setGo] = useState(DEFAULT_SW_PARAMS.go);
	const [ge, setGe] = useState(DEFAULT_SW_PARAMS.ge);
	const [slipw, setSlipw] = useState(DEFAULT_SW_PARAMS.slipw);
	const idGo = useId();
	const idGe = useId();
	const idSlipw = useId();

	const result = useMemo(
		() => swTrace(aVals, bVals, ic, { go, ge, slipw }),
		[aVals, bVals, ic, go, ge, slipw],
	);
	const gaps = result.path.filter(
		(s) => s.op === "gapA" || s.op === "gapB",
	).length;
	const atDefault =
		go === DEFAULT_SW_PARAMS.go &&
		ge === DEFAULT_SW_PARAMS.ge &&
		slipw === DEFAULT_SW_PARAMS.slipw;

	const reset = () => {
		setGo(DEFAULT_SW_PARAMS.go);
		setGe(DEFAULT_SW_PARAMS.ge);
		setSlipw(DEFAULT_SW_PARAMS.slipw);
	};

	return (
		<div className="btr-gaps">
			<div className="btr-tapes">
				<div className="btr-tape-row">
					<span className="btr-tape-label">
						AS175 (KH0192), groups {WINDOW_FROM + 1}–{WINDOW_TO + 1}
					</span>
					<NumberTape
						cords={tapeA}
						colors={colors}
						tile={16}
						groupGap={8}
						label="AS175 window, five-cord groups"
					/>
				</div>
				<div className="btr-tape-row">
					<span className="btr-tape-label">
						UR233 (KH0470), units {WINDOW_FROM + 1}–{WINDOW_TO + 1}
					</span>
					<NumberTape
						cords={tapeB}
						colors={colors}
						tile={16}
						groupGap={8}
						label="UR233 window, six-cord units with a blank cord added"
					/>
				</div>
			</div>
			<div className="diagram-tools btr-gap-sliders">
				<label className="btr-slider" htmlFor={idGo}>
					gap open
					<input
						id={idGo}
						type="range"
						min={0}
						max={12}
						step={0.5}
						value={go}
						onChange={(e) => setGo(Number(e.target.value))}
					/>
					<span>{go.toFixed(1)}</span>
				</label>
				<label className="btr-slider" htmlFor={idGe}>
					gap extend
					<input
						id={idGe}
						type="range"
						min={0}
						max={4}
						step={0.25}
						value={ge}
						onChange={(e) => setGe(Number(e.target.value))}
					/>
					<span>{ge.toFixed(2)}</span>
				</label>
				<label className="btr-slider" htmlFor={idSlipw}>
					slip credit
					<input
						id={idSlipw}
						type="range"
						min={0}
						max={1.5}
						step={0.05}
						value={slipw}
						onChange={(e) => setSlipw(Number(e.target.value))}
					/>
					<span>{slipw.toFixed(2)}</span>
				</label>
				<button
					type="button"
					className="btn"
					onClick={reset}
					disabled={atDefault}
				>
					reset to align.ts defaults
				</button>
			</div>
			<p className="btr-gap-readout" aria-live="polite">
				score <strong>{result.best.score.toFixed(1)}</strong> · {gaps} gapped
				cord
				{gaps === 1 ? "" : "s"} of {result.path.length} aligned
			</p>
			<DiffReading
				a={result.a}
				b={result.b}
				path={result.path}
				aLabel="AS175"
				bLabel="UR233"
			/>
		</div>
	);
}
