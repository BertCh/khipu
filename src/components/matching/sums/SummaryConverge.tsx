import { useState } from "react";
import type { SummaryRow } from "#/lib/stories/tiedtwice";
import { VERDICT_TEXT } from "#/lib/stories/tiedtwice";

export interface SummaryConvergeProps {
	rows: SummaryRow[];
}

const FIELD_NAME = [
	"white",
	"deep brown",
	"green",
	"light brown",
	"brown & olive",
];

function Converge({ row, side }: { row: SummaryRow; side: "a" | "b" }) {
	const W = 560;
	const H = 150;
	const targetX = W - 56;
	const targetY = H / 2;
	const n = row.terms.length;
	const topY = 14;
	const stepY = (H - 2 * topY) / Math.max(1, n - 1);
	const sum = side === "a" ? row.sumA : row.sumB;
	const verdict = side === "a" ? row.verdictA : row.verdictB;
	const label = side === "a" ? "AS175's own part 3" : "UR232's matching units";
	return (
		<div className="converge">
			<div className="converge-label">{label}</div>
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`${n} cords summing to ${sum}, against a target of ${row.target.value}`}
			>
				{row.terms.map((t, i) => {
					const cord = side === "a" ? t.a : t.b;
					const y = topY + i * stepY;
					const x0 = 46;
					return (
						<g key={t.group}>
							<path
								d={`M ${x0} ${y} C ${(x0 + targetX) / 2} ${y}, ${(x0 + targetX) / 2} ${targetY}, ${targetX - 20} ${targetY}`}
								className="converge-line"
							/>
							<circle cx={x0} cy={y} r={9} className="converge-term" />
							<text
								x={x0}
								y={y + 3}
								textAnchor="middle"
								className="converge-term-val"
							>
								{cord?.value ?? "—"}
							</text>
							<text
								x={x0 - 14}
								y={y + 3}
								textAnchor="end"
								className="converge-term-name"
							>
								{cord?.name ?? "—"}
							</text>
						</g>
					);
				})}
				<circle
					cx={targetX}
					cy={targetY}
					r={16}
					className={`converge-target is-${verdict}`}
				/>
				<text
					x={targetX}
					y={targetY + 4}
					textAnchor="middle"
					className="converge-target-val"
				>
					{sum}
				</text>
				<text
					x={targetX}
					y={targetY - 24}
					textAnchor="middle"
					className="converge-target-name"
				>
					{side === "a" ? row.target.name : "sum"}
				</text>
			</svg>
			<div className={`converge-verdict is-${verdict}`}>
				{row.terms
					.map((t) => (side === "a" ? t.a?.value : t.b?.value) ?? 0)
					.join(" + ")}
				{" = "}
				{sum} against {row.target.name}&rsquo;s {row.target.value} —{" "}
				{VERDICT_TEXT[verdict].toLowerCase()}
			</div>
		</div>
	);
}

/**
 * AS175's part 2 (three five-field groups) holds, field by field, the sum of
 * the matching field across the seven three-group sets of part 3 — checked
 * two ways: with AS175's own part-3 values, and with the Huacho piece UR232
 * that restates part 3 in its own cords. Source: src/lib/stories/tiedtwice.ts
 * (`summaryRows`).
 */
export default function SummaryConverge({ rows }: SummaryConvergeProps) {
	const [sel, setSel] = useState(() =>
		rows.findIndex((r) => r.k === 0 && r.field === 3),
	);
	const row = rows[sel] ?? rows[0];
	const exactA = rows.filter((r) => r.verdictA === "exact").length;
	const exactB = rows.filter((r) => r.verdictB === "exact").length;

	return (
		<div className="summary-converge">
			<div className="diagram-tools">
				<span>Summary group</span>
				{[0, 1, 2].map((k) => (
					<span key={k} className="converge-group-btns">
						{FIELD_NAME.map((name, f) => {
							const idx = rows.findIndex((r) => r.k === k && r.field === f);
							if (idx < 0) return null;
							return (
								<button
									key={`${k}-${name}`}
									type="button"
									className="btn"
									aria-pressed={idx === sel}
									onClick={() => setSel(idx)}
									title={`group ${k + 1}, ${name} field`}
								>
									{k + 1}·{name[0].toUpperCase()}
								</button>
							);
						})}
					</span>
				))}
			</div>
			<div className="converge-pair">
				<Converge row={row} side="a" />
				<Converge row={row} side="b" />
			</div>
			<p className="muted">
				Across all 15 (3 summary groups × 5 fields): AS175&rsquo;s own values
				match exactly <strong>{exactA} of 15</strong> times; UR232&rsquo;s{" "}
				<strong>{exactB} of 15</strong>.
			</p>
			<p className="muted">
				Source: src/lib/stories/tiedtwice.ts (summaryRows)
			</p>
		</div>
	);
}
