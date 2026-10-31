import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import {
	isTruncated,
	type LedgerGroup,
	ledgerGroups,
	ledgerStats,
	sharedValues,
} from "#/lib/stories/derive";

/** A cord's value as a chip carrying its colour. */
export function Chip({
	cord,
	colors,
	role,
	match,
}: {
	cord: Cord;
	colors: ColorTable;
	/** fixed | total | rest — sets the chip's typography */
	role?: "fixed" | "total" | "rest";
	match?: boolean;
}) {
	const code = cord.colorParsed?.[0]?.codes[0];
	const cut = isTruncated(cord);
	const text =
		cord.value == null ? "—" : cut && !cord.value ? "…" : cord.value.toString();
	return (
		<span
			className={`chip ${role ? `chip-${role}` : ""} ${match ? "chip-match" : ""} ${cut ? "chip-cut" : ""}`}
			title={`${cord.name}: ${cord.color ?? "no colour"}, ${cord.length ?? "?"} cm${cut ? " (truncated)" : ""}`}
		>
			<i style={{ background: hexFor(code, colors) }} aria-hidden="true" />
			{text}
		</span>
	);
}

function roleOf(g: LedgerGroup, i: number): "fixed" | "total" | "rest" {
	if (i === 0) return "total";
	if (i === g.fixedAt) return "fixed";
	return "rest";
}

/**
 * Every group of a ledger khipu as a row: its cords as chips, then whether
 * the first cord equals the fixed value plus the rest.
 */
export function LedgerTable({
	khipu,
	fixed,
	colors,
	limit,
}: {
	khipu: Khipu;
	fixed: number;
	colors: ColorTable;
	limit?: number;
}) {
	const groups = ledgerGroups(khipu, fixed);
	const shown = limit ? groups.slice(0, limit) : groups;
	const st = ledgerStats(groups);
	return (
		<div className="ledger">
			<table className="ledger-table">
				<thead>
					<tr>
						<th>Group</th>
						<th>Cords, as recorded</th>
						<th className="num">Total</th>
						<th className="num">{fixed} + rest</th>
						<th>Balances?</th>
					</tr>
				</thead>
				<tbody>
					{shown.map((g) => (
						<tr key={g.index}>
							<td className="num">{g.index + 1}</td>
							<td>
								<span className="chips">
									{g.cords.map((c, i) => (
										<Chip
											key={c.name}
											cord={c}
											colors={colors}
											role={roleOf(g, i)}
										/>
									))}
								</span>
							</td>
							<td className="num">{g.total?.toLocaleString() ?? "—"}</td>
							<td className="num">
								{g.fixedAt > 0 ? g.rest.toLocaleString() : "—"}
							</td>
							<td>
								{g.balances ? (
									<span className="ok">yes</span>
								) : g.fixedAt < 0 ? (
									<span className="muted">no {fixed}</span>
								) : g.damaged ? (
									<span className="muted">cord truncated</span>
								) : (
									<span className="no">no</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="ledger-summary">
				{st.withFixed} of {st.groups} groups carry the value {fixed}. Of those,{" "}
				{st.balances} balance exactly, {st.damaged} have a cord broken off above
				its units position, and {st.fails} do not balance as recorded
				{limit && groups.length > limit ? `. Showing the first ${limit}` : ""}.
			</p>
		</div>
	);
}

/**
 * Two khipus side by side, group for group. Values both record are marked, so
 * the reader can see one is a re-statement of the other.
 */
export function PairedLedger({
	a,
	b,
	fixed,
	colors,
	labelA,
	labelB,
	from = 0,
	to,
}: {
	a: Khipu;
	b: Khipu;
	fixed: number;
	colors: ColorTable;
	labelA: string;
	labelB: string;
	from?: number;
	to?: number;
}) {
	const ga = ledgerGroups(a, fixed);
	const gb = ledgerGroups(b, fixed);
	const shared = sharedValues(a, b, fixed);
	const n = Math.min(
		to ?? Math.max(ga.length, gb.length),
		Math.max(ga.length, gb.length),
	);
	const rows = [];
	for (let i = from; i < n; i++) rows.push(i);
	return (
		<div className="ledger">
			<table className="ledger-table ledger-paired">
				<thead>
					<tr>
						<th>Group</th>
						<th>{labelA}</th>
						<th>{labelB}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((i) => (
						<tr key={i}>
							<td className="num">{i + 1}</td>
							{[ga[i], gb[i]].map((g, col) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: two fixed columns
								<td key={col}>
									{g ? (
										<span className="chips">
											{g.cords.map((c, j) => (
												<Chip
													key={c.name}
													cord={c}
													colors={colors}
													role={roleOf(g, j)}
													match={c.value != null && shared.has(c.value)}
												/>
											))}
										</span>
									) : (
										<span className="muted">—</span>
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
