import { memo, type ReactNode, useMemo } from "react";
import { hexFor } from "#/lib/khipu/colors";
import type { Silhouettes } from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import type { CascadeGroup, Pendant } from "#/lib/stories/totals";
import "#/styles/stories/totals-cascade.css";

/**
 * Totals falling down the page to become heads. The upper khipu's groups
 * each fan into one strand carrying the group's total; the strand lands on
 * the head cord (first knotted cord of a group) of the khipu below that
 * holds the same number. A third khipu can hang underneath, tied to the
 * heads' khipu by its own cord-for-cord threads (a known mirror, shared
 * leaders). Every row is drawn at one shared pendant pitch, so the fan's
 * narrowing is real: nine cords of totals for every four or five cords of
 * the ledger they head.
 *
 * Nothing is drawn that the data do not hold: a total with no equal head
 * ends in an open circle; a head one digit away (and in order) is a dotted
 * ghost, not a match.
 */

export interface CascadeRow {
	id: string;
	/** second label line, e.g. "UR278 · group totals" */
	label: string;
	/** cords drawn, [from, to) */
	from: number;
	to: number;
}

export interface CascadeThread {
	/** cord on the heads row */
	a: number;
	/** cord on the row below */
	b: number;
	kind: "exact" | "near";
	va: number;
	vb: number;
}

export interface TotalsCascadeProps {
	totals: CascadeRow & { groups: CascadeGroup[] };
	heads: CascadeRow & {
		pendants: Pendant[];
		/** a fixed deduction on the cord after the head: marked "− fixed" */
		fixed?: number;
	};
	below?: CascadeRow & {
		threads: CascadeThread[];
		/** what the threads to this row are, e.g. "known mirror, expected" */
		note: string;
	};
	sils: Silhouettes;
	colors: ColorTable;
	/** totals under this are drawn but not matched */
	min?: number;
	label: string;
}

/** view-box units per cord */
const P = 6;
const GUT = 112;
const D = 30;
const EDGE = 10;

const median = (xs: number[]) => {
	if (!xs.length) return 0;
	const s = [...xs].sort((p, q) => p - q);
	return s[Math.floor(s.length / 2)];
};
const fmt = (n: number) => n.toLocaleString("en-GB");
const r2 = (n: number) => Math.round(n * 100) / 100;

function TotalsCascade({
	totals,
	heads,
	below,
	sils,
	colors,
	min = 1000,
	label,
}: TotalsCascadeProps) {
	const g = useMemo(() => {
		// horizontal: each row slides (in cords) under what it answers
		const tOff = 0;
		const tPos = (i: number) => i - totals.from + tOff;
		const centre = (c: CascadeGroup) => tPos((c.from + c.to - 1) / 2);
		const hOff = median(
			totals.groups
				.filter((c) => c.head != null)
				.map((c) => centre(c) - ((c.head as number) - heads.from)),
		);
		const hPos = (i: number) => i - heads.from + hOff;
		const bOff = below
			? median(below.threads.map((t) => hPos(t.a) - (t.b - below.from)))
			: 0;
		const bPos = (i: number) => (below ? i - below.from + bOff : 0);
		const spans = [
			[tPos(totals.from), tPos(totals.to - 1)],
			[hPos(heads.from), hPos(heads.to - 1)],
			...(below ? [[bPos(below.from), bPos(below.to - 1)]] : []),
		];
		const lo = Math.min(...spans.map((s) => s[0]));
		const hi = Math.max(...spans.map((s) => s[1]));
		const X = (pos: number) => r2(GUT + (pos - lo + 0.5) * P);
		const width = GUT + (hi - lo + 1) * P + EDGE;

		const rows = [totals, heads, ...(below ? [below] : [])];
		const maxL = Math.max(
			1,
			...rows.flatMap((r) =>
				(sils[r.id]?.l ?? []).slice(r.from, r.to).map((l) => l ?? 0),
			),
		);
		const depth = (id: string, i: number) =>
			Math.max(3, ((sils[id]?.l[i] ?? 0) / maxL) * D);
		const colour = (id: string, i: number) =>
			hexFor(sils[id]?.c[i] ?? undefined, colors);

		const yT = 24;
		const gy = yT + D + 14;
		const yH = gy + 86;
		const yB = yH + D + 76;
		const height = (below ? yB + 12 : yH) + D + 34;
		return {
			X,
			tPos,
			hPos,
			bPos,
			width,
			height,
			depth,
			colour,
			yT,
			gy,
			yH,
			yB,
		};
	}, [totals, heads, below, sils, colors]);

	const { X, tPos, hPos, bPos, depth, colour, yT, gy, yH, yB } = g;
	const headSet = new Set(
		totals.groups.filter((c) => c.head != null).map((c) => c.head as number),
	);
	const matchedCords = new Set(
		totals.groups
			.filter((c) => c.head != null)
			.flatMap((c) => range(c.from, c.to)),
	);
	const mirrorHeads = new Set(
		(below?.threads ?? []).filter((t) => headSet.has(t.a)).map((t) => t.b),
	);

	const cords = (
		row: CascadeRow,
		pos: (i: number) => number,
		y: number,
		lit: (i: number) => boolean,
	): ReactNode =>
		range(row.from, row.to).map((i) => {
			const d = `M${X(pos(i))},${y}V${r2(y + depth(row.id, i))}`;
			return (
				<g key={i} className={lit(i) ? "tc-cord is-lit" : "tc-cord"}>
					<path className="tc-casing" d={d} />
					<path d={d} stroke={colour(row.id, i)} />
				</g>
			);
		});

	const primary = (row: CascadeRow, pos: (i: number) => number, y: number) => (
		<line
			className="tc-primary"
			x1={X(pos(row.from)) - P / 2}
			x2={X(pos(row.to - 1)) + P / 2}
			y1={y}
			y2={y}
		/>
	);

	const rowLabel = (row: CascadeRow, y: number) => (
		<text className="tc-row-label" x={0} y={y + 3}>
			<tspan className="tc-row-id">{row.id}</tspan>
			<tspan x={0} dy={12}>
				{row.label}
			</tspan>
			<tspan x={0} dy={11} className="tc-row-range">
				cords {row.from + 1}–{row.to}
			</tspan>
		</text>
	);

	// the first matched head whose group reads head − fixed = the rest
	const callout = (() => {
		if (heads.fixed == null) return null;
		for (const c of totals.groups) {
			if (c.head == null) continue;
			const h = c.head;
			const ps = heads.pendants;
			if (ps[h + 1]?.value !== heads.fixed) continue;
			const rest: number[] = [];
			for (let j = h + 2; j < ps.length && ps[j].group === ps[h].group; j++)
				if (ps[j].value) rest.push(ps[j].value);
			if (rest.length && ps[h].value - heads.fixed === sum(rest))
				return { h, rest, value: ps[h].value };
		}
		return null;
	})();

	return (
		<figure className="totals-cascade">
			<div className="tc-scroll">
				<svg
					viewBox={`0 0 ${g.width} ${g.height}`}
					role="img"
					aria-label={label}
					style={{ minWidth: `${Math.min(760, g.width * 0.78)}px` }}
				>
					{rowLabel(totals, yT)}
					{rowLabel(heads, yH)}
					{below && rowLabel(below, yB)}

					{/* the totals row and its fans */}
					{primary(totals, tPos, yT)}
					{cords(totals, tPos, yT, (i) => matchedCords.has(i))}
					{totals.groups.map((c) => {
						const gx = X((tPos(c.from) + tPos(c.to - 1)) / 2);
						const small = c.total < min;
						const hit = c.head != null;
						const cls = hit
							? "tc-fan is-hit"
							: small
								? "tc-fan is-small"
								: "tc-fan";
						const fan = range(c.from, c.to)
							.map(
								(i) =>
									`M${X(tPos(i))},${r2(yT + depth(totals.id, i))}L${gx},${gy}`,
							)
							.join("");
						const title = hit
							? `${totals.id} group ${c.group}: ${fmt(c.total)} = the head of ${heads.id} pendant ${(c.head as number) + 1}`
							: small
								? `${totals.id} group ${c.group}: ${fmt(c.total)}, under ${fmt(min)} — too common to match`
								: c.near
									? `${totals.id} group ${c.group}: ${fmt(c.total)} — no equal head; ${heads.id} pendant ${c.near.cord + 1} reads ${fmt(c.near.value)}, one digit off`
									: `${totals.id} group ${c.group}: ${fmt(c.total)} — no head on ${heads.id} holds it`;
						return (
							<g key={c.group} className="tc-group">
								<title>{title}</title>
								<path className={cls} d={fan} />
								{hit ? (
									<>
										<circle className="tc-knot" cx={gx} cy={gy} r={2.4} />
										<text className="tc-total is-hit" x={gx} y={gy + 11}>
											{fmt(c.total)}
										</text>
										<path
											className="tc-strand"
											d={strand(gx, gy + 15, X(hPos(c.head as number)), yH)}
										/>
										<circle
											className="tc-land"
											cx={X(hPos(c.head as number))}
											cy={yH}
											r={2.2}
										/>
									</>
								) : small ? (
									<circle className="tc-small" cx={gx} cy={gy} r={1.2} />
								) : (
									<>
										<circle className="tc-open" cx={gx} cy={gy} r={3} />
										<text className="tc-total" x={gx} y={gy + 12}>
											{fmt(c.total)}
										</text>
										{c.near && (
											<>
												<path
													className="tc-ghost"
													d={strand(gx, gy + 16, X(hPos(c.near.cord)), yH)}
												/>
												<text
													className="tc-near"
													x={(gx + X(hPos(c.near.cord))) / 2}
													y={(gy + yH) / 2 + 12}
												>
													≈ {fmt(c.near.value)}
												</text>
											</>
										)}
									</>
								)}
							</g>
						);
					})}

					{/* the heads row */}
					{primary(heads, hPos, yH)}
					{cords(heads, hPos, yH, (i) => headSet.has(i))}
					{heads.fixed != null &&
						totals.groups.map((c) => {
							if (c.head == null) return null;
							const h = c.head;
							if (h + 1 >= heads.to) return null;
							if (heads.pendants[h + 1]?.value !== heads.fixed) return null;
							const x0 = X(hPos(h));
							const x1 = X(hPos(h + 1));
							const y = yH + D + 5;
							return (
								<g key={h} className="tc-deduct">
									<title>{`${heads.id} pendant ${h + 2}: the fixed ${heads.fixed}, taken from the head ${fmt(heads.pendants[h].value)}`}</title>
									<path
										d={`M${x0},${y}Q${(x0 + x1) / 2},${y + 7} ${x1},${y}`}
									/>
									<text x={(x0 + x1) / 2} y={y + 15}>
										−{heads.fixed}
									</text>
								</g>
							);
						})}
					{callout && (
						<text
							className="tc-callout"
							x={X(hPos(callout.h)) - P / 2}
							y={yH + D + 32}
						>
							{fmt(callout.value)} − {heads.fixed} ={" "}
							{callout.rest.map(fmt).join(" + ")}
						</text>
					)}

					{/* the row below, hung by its own threads */}
					{below && (
						<>
							<g className="tc-below-threads">
								{below.threads
									.filter(
										(t) =>
											t.a >= heads.from &&
											t.a < heads.to &&
											t.b >= below.from &&
											t.b < below.to,
									)
									.map((t) => (
										<path
											key={`${t.a}-${t.b}`}
											className={`tc-mirror is-${t.kind}${headSet.has(t.a) ? " is-head" : ""}`}
											d={strand(
												X(hPos(t.a)),
												r2(yH + depth(heads.id, t.a) + 1),
												X(bPos(t.b)),
												yB,
											)}
										>
											<title>{`${heads.id} pendant ${t.a + 1} = ${fmt(t.va)} · ${below.id} pendant ${t.b + 1} = ${fmt(t.vb)}${t.kind === "near" ? " (near)" : ""}`}</title>
										</path>
									))}
							</g>
							{primary(below, bPos, yB)}
							{cords(below, bPos, yB, (i) => mirrorHeads.has(i))}
							<text
								className="tc-below-note"
								x={X(bPos(below.to - 1)) + P / 2}
								y={yB + D + 16}
								textAnchor="end"
							>
								{below.note}
							</text>
						</>
					)}
				</svg>
			</div>
			<ul className="tc-key">
				<li>
					<i className="tc-key-sum" aria-hidden="true" /> a group’s total,
					carried to an equal head
				</li>
				<li>
					<i className="tc-key-open" aria-hidden="true" /> a total no head holds
				</li>
				{totals.groups.some((c) => c.near) && (
					<li>
						<i className="tc-key-ghost" aria-hidden="true" /> a head one digit
						off: not counted
					</li>
				)}
				{below && (
					<li>
						<i
							className={`tc-key-mirror${below.threads.some((t) => t.kind === "near") ? " has-near" : ""}`}
							aria-hidden="true"
						/>{" "}
						{below.note}
					</li>
				)}
			</ul>
		</figure>
	);
}

function range(a: number, b: number): number[] {
	return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
}

function sum(xs: number[]) {
	return xs.reduce((s, x) => s + x, 0);
}

/** a vertical S from (x0, y0) down to (x1, y1) */
function strand(x0: number, y0: number, x1: number, y1: number) {
	const m = (y0 + y1) / 2;
	return `M${r2(x0)},${r2(y0)}C${r2(x0)},${r2(m)} ${r2(x1)},${r2(m)} ${r2(x1)},${r2(y1)}`;
}

export default memo(TotalsCascade);
