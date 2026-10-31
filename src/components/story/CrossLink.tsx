import type { ReactNode } from "react";
import KhipuSilhouette, {
	type SilhouetteCord,
} from "#/components/khipu/KhipuSilhouette";
import type { ColorTable } from "#/lib/khipu/types";
import {
	compareValue,
	type FieldComparison,
	type FieldVerdict,
	type GroupAlignment,
} from "#/lib/stories/crosslinks";

const VERDICT_LABEL: Record<FieldVerdict, string> = {
	exact: "same",
	near: "within 2%",
	blank: "blanked",
	different: "different",
	missing: "missing",
};

export function LinkedSilhouettes({
	items,
	colors,
}: {
	items: {
		id: string;
		alias: string;
		cords: SilhouetteCord[];
	}[];
	colors: ColorTable;
}) {
	return (
		<div className="linked-silhouettes">
			{items.map((item) => (
				<div key={item.id}>
					<div className="linked-silhouette-label">
						<strong>{item.id}</strong> <span>{item.alias}</span>
					</div>
					<KhipuSilhouette
						cords={item.cords}
						colors={colors}
						width={720}
						height={72}
					/>
				</div>
			))}
		</div>
	);
}

export function EvidenceDeck({
	items,
}: {
	items: { value: ReactNode; label: ReactNode; note?: ReactNode }[];
}) {
	return (
		<div className="evidence-deck">
			{items.map((item) => (
				<div className="evidence-stat" key={String(item.label)}>
					<strong>{item.value}</strong>
					<span>{item.label}</span>
					{item.note && <small>{item.note}</small>}
				</div>
			))}
		</div>
	);
}

export function TransformationMatrix({ rows }: { rows: GroupAlignment[] }) {
	return (
		<div className="transformation-figure">
			<ul className="transformation-legend" aria-label="Comparison key">
				{(
					[
						["exact", "Same"],
						["near", "Within 2%"],
						["blank", "Blanked"],
						["different", "Changed"],
					] as const
				).map(([verdict, label]) => (
					<li key={verdict}>
						<i className={`match-${verdict}`} aria-hidden="true" /> {label}
					</li>
				))}
			</ul>
			<div className="transformation-matrix">
				{rows.map((row) => (
					<div
						className="transformation-row"
						key={`${row.aGroup}-${row.bGroup}`}
					>
						<div className="transformation-row-label">
							<strong>
								g{row.aGroup + 1} → g{row.bGroup + 1}
							</strong>
							<span>{row.exact}/18 exact</span>
						</div>
						<div className="transformation-fields">
							{row.fields.map((field) => (
								<div
									key={field.position}
									className={`transformation-field match-${field.verdict}`}
									title={`Field ${field.position + 1}: ${field.a?.toLocaleString() ?? "missing"} → ${field.b?.toLocaleString() ?? "missing"} (${VERDICT_LABEL[field.verdict]})`}
								>
									<span>{field.position + 1}</span>
									<b>
										{field.b === 0 && field.a !== 0
											? "—"
											: field.b?.toLocaleString()}
									</b>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function PairedPassage({
	left,
	right,
	leftValues,
	rightValues,
	leftTone = "neutral",
	rightTone = "neutral",
	reversed = false,
	boundaryAfter,
}: {
	left: ReactNode;
	right: ReactNode;
	leftValues: (number | null)[];
	rightValues: (number | null)[];
	leftTone?: "brown" | "white" | "blue" | "yellow" | "neutral";
	rightTone?: "brown" | "white" | "blue" | "yellow" | "neutral";
	reversed?: boolean;
	boundaryAfter?: number;
}) {
	const verdicts = leftValues.map((value, position) =>
		compareValue(value, rightValues[position] ?? null),
	);
	const renderRow = (
		label: ReactNode,
		values: (number | null)[],
		tone: string,
		showVerdict: boolean,
	) => {
		const seen = new Map<number | null, number>();
		const cells = values.map((value, position) => {
			const occurrence = seen.get(value) ?? 0;
			seen.set(value, occurrence + 1);
			return { key: `${value ?? "missing"}-${occurrence}`, position, value };
		});
		return (
			<div className="passage-row">
				<div className="passage-label">{label}</div>
				<div className="passage-cords">
					{cells.map(({ key, position, value }) => (
						<div
							key={key}
							className={`passage-cord tone-${tone}${boundaryAfter === position ? " has-boundary" : ""}${showVerdict ? ` match-${verdicts[position] ?? "missing"}` : ""}`}
						>
							<i aria-hidden="true" />
							<span>{value == null ? "—" : value.toLocaleString()}</span>
						</div>
					))}
				</div>
			</div>
		);
	};
	return (
		<div className="paired-passage">
			{renderRow(left, leftValues, leftTone, false)}
			<div className="passage-action" aria-hidden="true">
				<span>{reversed ? "reverse direction" : "same order"}</span>
			</div>
			{renderRow(right, rightValues, rightTone, true)}
		</div>
	);
}

export function ArchiveBridge({
	reverseExact,
	tableExact,
}: {
	reverseExact: number;
	tableExact: number;
}) {
	return (
		<div
			className="archive-bridge"
			role="img"
			aria-label="KH0689 shares values with two Pachacamac khipus now in Berlin"
		>
			<div className="archive-place">
				<span>Pachacamac</span>
				<small>recorded provenance</small>
			</div>
			<div className="archive-node archive-node-left">
				<strong>KH0450</strong>
				<span>Berlin · VA42513</span>
			</div>
			<div className="archive-link archive-link-left">
				<b>{reverseExact}/14</b>
				<span>reversed</span>
			</div>
			<div className="archive-node archive-node-focus">
				<strong>KH0689</strong>
				<span>Basel · near Huacho</span>
			</div>
			<div className="archive-link archive-link-right">
				<b>{tableExact}/10</b>
				<span>aligned</span>
			</div>
			<div className="archive-node archive-node-right">
				<strong>KH0147</strong>
				<span>Berlin · VA42510</span>
			</div>
		</div>
	);
}

export function ValueRun({
	values,
	label,
	compact = false,
}: {
	values: (number | null)[];
	label?: ReactNode;
	compact?: boolean;
}) {
	const seen = new Map<number | null, number>();
	const cells = values.map((value) => {
		const occurrence = seen.get(value) ?? 0;
		seen.set(value, occurrence + 1);
		return { key: `${value ?? "missing"}-${occurrence}`, value };
	});
	return (
		<div className={`value-run ${compact ? "is-compact" : ""}`}>
			{label && <div className="value-run-label">{label}</div>}
			<div className="value-run-values">
				{cells.map(({ key, value }) => (
					<span key={key}>{value == null ? "—" : value.toLocaleString()}</span>
				))}
			</div>
		</div>
	);
}

export function ComparisonTable({
	rows,
	left,
	right,
	positionLabel = "Field",
}: {
	rows: FieldComparison[];
	left: ReactNode;
	right: ReactNode;
	positionLabel?: string;
}) {
	return (
		<div className="ledger match-ledger">
			<table className="ledger-table">
				<thead>
					<tr>
						<th className="num">{positionLabel}</th>
						<th>{left}</th>
						<th>{right}</th>
						<th>Reading</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.position} className={`match-${row.verdict}`}>
							<td className="num">{row.position + 1}</td>
							<td className="num">
								{row.a == null ? "—" : row.a.toLocaleString()}
							</td>
							<td className="num">
								{row.b == null ? "—" : row.b.toLocaleString()}
							</td>
							<td
								className={
									row.verdict === "exact"
										? "ok"
										: row.verdict === "different"
											? "no"
											: "muted"
								}
							>
								{VERDICT_LABEL[row.verdict]}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
