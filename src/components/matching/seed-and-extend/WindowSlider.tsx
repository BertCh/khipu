import { useMemo, useState } from "react";
import NumberTape from "#/components/matching/NumberTape";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { ColorTable } from "#/lib/khipu/types";
import {
	type WindowDiag,
	type WindowSize,
	windowDiagnostics,
} from "#/lib/matching/seed-and-extend/windowDiagnostics";
import type { TapeCord } from "#/lib/matching/tape";
import { TileLegend } from "./TileLegend";

const MIN_MAX = 15;

/**
 * Step 2's figure: a bracket of width 5 (then 4) sliding along one khipu's
 * number tape. Every window's informative/dull call comes from
 * `informative5`/`informative4` in src/lib/engine/tests/passages.ts, via
 * `windowDiagnostics` (src/lib/matching/seed-and-extend/windowDiagnostics.ts),
 * which only narrates which check that call turned on.
 */
export function WindowSlider({
	cords,
	values,
	colors,
	label,
}: {
	cords: TapeCord[];
	values: number[];
	colors: ColorTable;
	label: string;
}) {
	const [W, setW] = useState<WindowSize>(5);
	const diags = useMemo(
		() => windowDiagnostics(values, W, MIN_MAX),
		[values, W],
	);
	const firstInformative = diags.findIndex((d) => d.informative);
	const trace = useTrace(diags.length, {
		fps: 1.4,
		reducedStep: firstInformative >= 0 ? firstInformative : undefined,
	});
	const d: WindowDiag | undefined = diags[trace.step];

	const { seeded, touched } = useMemo(() => {
		const seeded = new Set<number>();
		const touched = new Set<number>();
		for (let s = 0; s <= trace.step; s++) {
			const win = diags[s];
			if (!win) continue;
			for (let k = 0; k < win.W; k++) {
				touched.add(win.start + k);
				if (win.informative) seeded.add(win.start + k);
			}
		}
		return { seeded, touched };
	}, [diags, trace.step]);

	const state = (i: number) => {
		if (d && i >= d.start && i < d.start + d.W) return "window" as const;
		if (seeded.has(i)) return "seed" as const;
		if (touched.has(i)) return "dim" as const;
		return "idle" as const;
	};

	const ticks = useMemo(
		() => diags.flatMap((win, i) => (win.informative ? [i] : [])).slice(0, 1),
		[diags],
	);

	return (
		<div className="sae-window-fig">
			<fieldset className="diagram-tools sae-w-toggle">
				<legend className="sr-only">Window width</legend>
				<span style={{ color: "var(--ink-3)" }}>Window</span>
				{([5, 4] as const).map((w) => (
					<button
						key={w}
						type="button"
						className="btn"
						aria-pressed={W === w}
						onClick={() => setW(w)}
					>
						{w} wide
					</button>
				))}
			</fieldset>
			<TracePlayer
				state={trace}
				ticks={ticks}
				label={`${label} sliding window`}
				caption={
					d && (
						<>
							Window at cord {d.start + 1}–{d.start + d.W}: [
							{d.values.join(", ")}] —{" "}
							<strong className={d.informative ? "is-yes" : "is-no"}>
								{d.informative ? "informative" : "not informative"}
							</strong>
							, {d.reason}.
						</>
					)
				}
			>
				<NumberTape
					cords={cords}
					colors={colors}
					state={state}
					label={`${label}, window of ${W} sliding along ${cords.length} cords`}
				/>
			</TracePlayer>
			<TileLegend
				items={[
					{ state: "idle", label: "not yet reached" },
					{ state: "dim", label: "checked, not informative" },
					{ state: "seed", label: "informative" },
					{ state: "window", label: "current window" },
				]}
			/>
		</div>
	);
}

export default WindowSlider;
