import { useMemo } from "react";
import NumberTape from "#/components/matching/NumberTape";
import PermutationArcs from "#/components/matching/PermutationArcs";
import type { ColorTable, Cord } from "#/lib/khipu/types";
import { verdictTileState } from "#/lib/matching/reordering/verdictState";
import type { TapeCord } from "#/lib/matching/tape";
import { FIELDS, type HuachoSide, type UnitRow } from "#/lib/stories/tiedtwice";

/** One cord (or a missing one) as a tiny tape of its own, i = position given. */
function tapeCord(c: Cord | null, i: number): TapeCord {
	return {
		i,
		value: c?.value ?? 0,
		group: 0,
		color: c?.color ?? null,
		name: c?.name ?? "—",
	};
}

/** Field index 0–4, or 5 for the Huacho unit's one position no field maps to. */
const BLANK_ORIGIN = 5;

// PermutationArcs draws short labels in a fixed small circle, so the field's
// own (sometimes five-character) colour code doesn't fit — the arcs use the
// field number instead, with the codes spelled out once underneath.
const FIELD_LABEL = (origin: number) =>
	origin === BLANK_ORIGIN ? "–" : String(origin);

/**
 * One Huacho unit beside the AS175 group it restates: the five real fields
 * as a crossing-arcs permutation into six slots (the Huacho side's own
 * `map`/`blankAt`, nothing invented), with the actual cords of one unit
 * drawn underneath so the arcs resolve into real colours and values.
 */
export default function FieldMapFigure({
	row,
	side,
	colors,
	aliasA,
	aliasB,
}: {
	row: UnitRow;
	side: HuachoSide;
	colors: ColorTable;
	aliasA: string;
	aliasB: string;
}) {
	const perm = useMemo(() => {
		const p = new Array<number>(6).fill(BLANK_ORIGIN);
		side.map.forEach((slot, field) => {
			p[slot] = field;
		});
		return p;
	}, [side]);

	const tapeA = useMemo(
		() => row.fields.map((f, i) => tapeCord(f.a, i)),
		[row],
	);
	const tapeB = useMemo(() => row.b.map((c, i) => tapeCord(c, i)), [row]);

	return (
		<div className="reorder-fieldmap">
			<NumberTape
				cords={tapeA}
				colors={colors}
				tile={24}
				groupGap={6}
				label={`${aliasA} group ${row.group + 1}, five fields`}
			/>
			<PermutationArcs
				n={6}
				perm={perm}
				labels={FIELD_LABEL}
				mode="rows"
				highlight={new Set([BLANK_ORIGIN])}
				cellSize={40}
			/>
			<p className="reorder-fieldmap-key">
				{FIELDS.map((f, i) => (
					<span key={f.code}>
						{i} = {f.code} ({f.label})
					</span>
				))}
				<span>– = blank</span>
			</p>
			<NumberTape
				cords={tapeB}
				colors={colors}
				tile={24}
				groupGap={6}
				label={`${aliasB} unit ${row.unit + 1}, six cords`}
			/>
			<ol className="reorder-verdict-row" aria-label="How each field agrees">
				{row.fields.map((f) => (
					<li
						key={f.field}
						className={`reorder-verdict is-${verdictTileState(f.verdict)}`}
					>
						<span className="reorder-verdict-field">
							{FIELDS[f.field].code}
						</span>
						<span className="reorder-verdict-mark" aria-hidden="true" />
						<span className="reorder-verdict-text">
							{f.va ?? "—"} · {f.vb ?? "—"}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}
