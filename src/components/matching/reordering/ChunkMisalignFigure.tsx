import { useMemo } from "react";
import { TracePlayer } from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { UnitRow } from "#/lib/stories/tiedtwice";

function tierOf(row: UnitRow): "strong" | "partial" | "weak" {
	const exact = row.fields.filter((f) => f.verdict === "exact").length;
	if (exact >= 4) return "strong";
	if (exact >= 1) return "partial";
	return "weak";
}

function UnitStrip({
	rows,
	current,
	label,
}: {
	rows: UnitRow[];
	current: number;
	label: string;
}) {
	return (
		<div className="chunk-strip">
			<div className="chunk-strip-label">{label}</div>
			<ol className="chunk-strip-units" aria-label={label}>
				{rows.map((r, i) => {
					const exact = r.fields.filter((f) => f.verdict === "exact").length;
					return (
						<li
							key={r.unit}
							className={`chunk-unit is-${tierOf(r)}${i === current ? " is-current" : ""}`}
							title={`unit ${r.unit + 1}: ${exact} of ${r.fields.length} fields exact`}
						/>
					);
				})}
			</ol>
		</div>
	);
}

/**
 * The two ways to cut a Huacho piece into six-cord units: the recorder's own
 * groups (UR232, almost all sixes) and a straight six-at-a-time chunking
 * (what UR233 needs, since its own groups don't run in sixes at all). Scrub
 * through the 21 units; past the one short group, chunking straight through
 * in sixes reads the wrong six cords for every later unit.
 */
export default function ChunkMisalignFigure({
	rowsRecorded,
	rowsSixes,
	shortUnit,
	aliasB,
}: {
	rowsRecorded: UnitRow[];
	rowsSixes: UnitRow[];
	/** 0-based unit index of the recorded group with fewer than six cords */
	shortUnit: number;
	aliasB: string;
}) {
	const state = useTrace(rowsRecorded.length, { fps: 1, reducedStep: 20 });
	const i = state.step;
	const r = rowsRecorded[i];
	const w = rowsSixes[i];
	const exactR = r.fields.filter((f) => f.verdict === "exact").length;
	const exactW = w.fields.filter((f) => f.verdict === "exact").length;
	const diverged = i > shortUnit;

	const totals = useMemo(() => {
		const sum = (rows: UnitRow[]) =>
			rows.reduce(
				(s, row) => s + row.fields.filter((f) => f.verdict === "exact").length,
				0,
			);
		return { recorded: sum(rowsRecorded), sixes: sum(rowsSixes) };
	}, [rowsRecorded, rowsSixes]);

	return (
		<TracePlayer
			state={state}
			ticks={[0, shortUnit, rowsRecorded.length - 1]}
			label="Chunking"
			caption={
				<>
					Unit {i + 1}: by its own groups, {aliasB} has {exactR} of 5 fields
					exact here; chunked straight through in sixes instead, {exactW} of 5
					are exact.{" "}
					{i === shortUnit ? (
						<strong>
							This is the recorder's five-cord group — one cord short of six.
						</strong>
					) : diverged ? (
						<>Past it, the sixes chunking is reading the wrong six cords.</>
					) : (
						<>Before it, the two chunkings agree — same cords, same order.</>
					)}{" "}
					Totals over all 21 units: <strong>{totals.recorded}</strong> exact by
					recorded groups, {totals.sixes} exact chunked in sixes.
				</>
			}
		>
			<div className="reorder-chunk-player">
				<UnitStrip
					rows={rowsRecorded}
					current={i}
					label={`${aliasB}, chunked by its own recorded groups`}
				/>
				<UnitStrip
					rows={rowsSixes}
					current={i}
					label={`${aliasB}, chunked straight through in sixes`}
				/>
			</div>
		</TracePlayer>
	);
}
