import type { ReactNode } from "react";

interface FigureProps {
	title: string;
	/** one plain sentence on what the reader should take away */
	note?: ReactNode;
	children: ReactNode;
	/** rows for the table twin: [label, value, ...extra] */
	table?: { head: string[]; rows: (string | number)[][] };
	wide?: boolean;
}

/** A chart with its title, note, and an always-available table view. */
export default function Figure({
	title,
	note,
	children,
	table,
	wide,
}: FigureProps) {
	return (
		<figure className={`figure ${wide ? "figure-wide" : ""}`}>
			<figcaption>
				<h3>{title}</h3>
				{note && <p>{note}</p>}
			</figcaption>
			<div className="figure-body">{children}</div>
			{table && (
				<details className="figure-table">
					<summary>Table</summary>
					<table>
						<thead>
							<tr>
								{table.head.map((h) => (
									<th key={h}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{table.rows.map((r) => (
								<tr key={String(r[0])}>
									{r.map((c, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: positional cells
										<td key={i}>
											{typeof c === "number" ? c.toLocaleString() : c}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</details>
			)}
		</figure>
	);
}

export function StatTile({
	label,
	value,
	hint,
}: {
	label: string;
	value: string | number;
	hint?: string;
}) {
	return (
		<div className="stat">
			<div className="stat-value">
				{typeof value === "number" ? value.toLocaleString() : value}
			</div>
			<div className="stat-label">{label}</div>
			{hint && <div className="stat-hint">{hint}</div>}
		</div>
	);
}
