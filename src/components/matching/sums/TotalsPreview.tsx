import { Link } from "@tanstack/react-router";
import type { TotalToHead } from "#/lib/stories/totals";

export interface TotalsPreviewProps {
	rows: TotalToHead[];
	totalsLabel: string;
	headsLabel: string;
	limit?: number;
}

/**
 * A total on one khipu equalling the head cord of another: KH0517's group
 * totals, walked in order against KH0502's group heads. Source:
 * src/lib/stories/totals.ts (`totalsToHeads`); the full chain and its
 * corpus-level checks are in /stories/totals-that-travel.
 */
export default function TotalsPreview({
	rows,
	totalsLabel,
	headsLabel,
	limit = 14,
}: TotalsPreviewProps) {
	const shown = rows.slice(0, limit);
	const matched = rows.filter((r) => r.head).length;
	const matchedShown = shown.filter((r) => r.head).length;
	return (
		<div className="totals-preview">
			<div className="ledger">
				<table className="ledger-table">
					<thead>
						<tr>
							<th className="num">{totalsLabel} group</th>
							<th className="num">cords</th>
							<th className="num">total</th>
							<th />
							<th>{headsLabel} head</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((r) => (
							<tr key={r.group} className={r.head ? "is-exact" : "is-miss"}>
								<td className="num">{r.group}</td>
								<td className="num">{r.cords}</td>
								<td className="num">{r.total.toLocaleString()}</td>
								<td className="totals-preview-arrow">{r.head ? "=" : "≠"}</td>
								<td>
									{r.head
										? `${r.head.name} (group ${r.head.group}) = ${r.head.value.toLocaleString()}`
										: "no head matches"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="muted">
				{matched} of {rows.length} groups on {totalsLabel} find their total on a
				head of {headsLabel}, in order. The table above shows the first{" "}
				{shown.length} groups, with {matchedShown} matches among them; the other{" "}
				{matched - matchedShown} matches sit further down the khipu, not shown
				here. The full chain, with the khipu it leads to next, is in{" "}
				<Link to="/stories/totals-that-travel">Totals that travel</Link>.
			</p>
			<p className="muted">Source: src/lib/stories/totals.ts (totalsToHeads)</p>
		</div>
	);
}
