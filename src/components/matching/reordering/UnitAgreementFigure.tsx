import { useMemo } from "react";
import NumberTape from "#/components/matching/NumberTape";
import { TracePlayer } from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { ColorTable, Cord } from "#/lib/khipu/types";
import { verdictTileState } from "#/lib/matching/reordering/verdictState";
import type { TapeCord } from "#/lib/matching/tape";
import {
	FIELDS,
	type HuachoSide,
	pairStats,
	type UnitRow,
	VERDICT_TEXT,
	type Verdict,
} from "#/lib/stories/tiedtwice";

function tapeCord(c: Cord | null, i: number): TapeCord {
	return {
		i,
		value: c?.value ?? 0,
		group: 0,
		color: c?.color ?? null,
		name: c?.name ?? "—",
	};
}

/** Step through every unit of a Huacho piece against the AS175 group it restates. */
export default function UnitAgreementFigure({
	rows,
	side,
	colors,
	aliasA,
	aliasB,
}: {
	rows: UnitRow[];
	side: HuachoSide;
	colors: ColorTable;
	aliasA: string;
	aliasB: string;
}) {
	const state = useTrace(rows.length, { fps: 1.2 });
	const row = rows[state.step];

	const tapeA = useMemo(
		() => row.fields.map((f, i) => tapeCord(f.a, i)),
		[row],
	);
	const tapeB = useMemo(() => row.b.map((c, i) => tapeCord(c, i)), [row]);
	const slotVerdict = useMemo(() => {
		const v = new Array<Verdict>(row.b.length).fill("na");
		side.map.forEach((slot, f) => {
			v[slot] = row.fields[f]?.verdict ?? "na";
		});
		return v;
	}, [row, side]);
	const stateA = (i: number) =>
		verdictTileState(row.fields[i]?.verdict ?? "na");
	const stateB = (i: number) => verdictTileState(slotVerdict[i] ?? "na");

	const cumulative = useMemo(
		() => pairStats(rows.slice(0, state.step + 1)),
		[rows, state.step],
	);
	const total = useMemo(() => pairStats(rows), [rows]);

	const here = row.fields
		.map((f) => `${FIELDS[f.field].label}: ${VERDICT_TEXT[f.verdict]}`)
		.join(", ");
	const isLast = state.step === rows.length - 1;
	const caption = (
		<>
			Unit {row.unit + 1} of {rows.length} ({aliasA} group {row.group + 1} ·{" "}
			{aliasB} unit {row.unit + 1}): {here}. Running total —{" "}
			<strong>{cumulative.exact}</strong> exact, {cumulative.one} off by one,{" "}
			{cumulative.ten} by a ten, {cumulative.register} a register,{" "}
			{cumulative.no} disagree, of {cumulative.compared} compared so far.
			{isLast && (
				<>
					{" "}
					Final:{" "}
					<strong>
						{total.exact} of {total.compared}
					</strong>{" "}
					fields hold the same number.
				</>
			)}
		</>
	);

	return (
		<TracePlayer
			state={state}
			ticks={[0, 5, 10, 15, 20].filter((t) => t < rows.length)}
			label={`${aliasB} units`}
			caption={caption}
		>
			<div className="reorder-unit-player">
				<NumberTape
					cords={tapeA}
					state={stateA}
					colors={colors}
					tile={24}
					groupGap={6}
					label={`${aliasA} group ${row.group + 1}`}
				/>
				<NumberTape
					cords={tapeB}
					state={stateB}
					colors={colors}
					tile={24}
					groupGap={6}
					label={`${aliasB} unit ${row.unit + 1}`}
				/>
			</div>
		</TracePlayer>
	);
}
