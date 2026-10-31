import { hexFor } from "#/lib/khipu/colors";
import type { Silhouettes } from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import type { Placement } from "#/lib/stories/basel";
import { fixedUnits } from "#/lib/stories/basel";
import { pairKey } from "#/lib/stories/links";
import { MATCH_KINDS, type StrandFile } from "#/lib/stories/strands";

/**
 * The reconstruction strip: the Basel khipu as fourteen units of a brown
 * group, a blank, and a white group, drawn between the two Berlin khipus that
 * hold the same groups — KH0450 above with its units in mirror order, KH0147
 * below in forward order. A line joins unit k on each: KH0450's lines cross
 * into an X, KH0147's drop straight down. Units a fragment fixes are drawn
 * solid; the rest are the inference, drawn faded.
 */

const UNIT_W = 60;
const LEFT = 12;
const BROWN_W = 26;
const WHITE_W = 22;
const GAP = 4;

const ROW_450 = 24;
const ROW_TOP = 132;
const ROW_147 = 250;
const STRIP_H = 286;

export function ReconstructionStrip({
	placements,
	units,
}: {
	placements: Placement[];
	units: number;
}) {
	const fixed = fixedUnits(placements);
	const width = LEFT * 2 + units * UNIT_W;
	const ks = Array.from({ length: units }, (_, i) => i + 1);
	const label = (k: number) => {
		const ids = [
			...new Set([
				...(fixed.brown.get(k) ?? []),
				...(fixed.white.get(k) ?? []),
			]),
		];
		return ids.map((id) => id.replace("KH0", "")).join(" ");
	};
	const mid = (pos: number) => LEFT + (pos - 1) * UNIT_W + UNIT_W / 2;
	return (
		<svg
			className="basel-strip"
			viewBox={`0 0 ${width} ${STRIP_H}`}
			width="100%"
			role="img"
			aria-label="The reconstructed Basel khipu: fourteen units of a brown group and a white group, between KH0450 above in mirror order and KH0147 below in forward order, unit k joined to unit k on each"
		>
			{/* unit k to unit k: KH0450 (mirror order) → Basel → KH0147 */}
			<g className="basel-links">
				{ks.map((k) => {
					const b = fixed.brown.has(k);
					const w = fixed.white.has(k);
					const x450 = mid(units + 1 - k);
					const x = mid(k);
					const y0 = ROW_450 + 34;
					const y1 = ROW_TOP - 4;
					const ym = (y0 + y1) / 2;
					return (
						<g key={k}>
							<path
								className={`basel-link is-brown ${b ? "is-fixed" : "is-inferred"}`}
								d={`M${x450},${y0}C${x450},${ym} ${x},${ym} ${x},${y1}`}
							/>
							<path
								className={`basel-link is-white ${w ? "is-fixed" : "is-inferred"}`}
								d={`M${x},${ROW_TOP + 84}V${ROW_147 - 4}`}
							/>
						</g>
					);
				})}
			</g>

			<text x={LEFT} y={ROW_450 - 10} className="basel-strip-title">
				KH0450 · Berlin VA42513 · the brown groups, unit and cord order both
				reversed
			</text>
			<line
				x1={LEFT}
				y1={ROW_450}
				x2={width - LEFT}
				y2={ROW_450}
				className="basel-primary"
			/>
			{ks.map((pos) => {
				const k = units + 1 - pos;
				const x = LEFT + (pos - 1) * UNIT_W + 4;
				const b = fixed.brown.has(k);
				return (
					<g key={k}>
						<rect
							x={x}
							y={ROW_450}
							width={UNIT_W - 8}
							height={14}
							className={`basel-brown ${b ? "is-fixed" : "is-inferred"}`}
						/>
						<text
							x={x + (UNIT_W - 8) / 2}
							y={ROW_450 + 28}
							textAnchor="middle"
							className={`basel-unit ${b ? "is-fixed" : ""}`}
						>
							{k}
						</text>
					</g>
				);
			})}

			<text x={LEFT} y={ROW_TOP - 8} className="basel-strip-title">
				Basel khipu, reconstructed · unit k = brown group k · blank · white
				group k
			</text>
			<line
				x1={LEFT}
				y1={ROW_TOP}
				x2={width - LEFT}
				y2={ROW_TOP}
				className="basel-primary"
			/>
			{ks.map((k) => {
				const x = LEFT + (k - 1) * UNIT_W + 4;
				const b = fixed.brown.has(k);
				const w = fixed.white.has(k);
				const any = b || w;
				return (
					<g key={k}>
						<rect
							x={x}
							y={ROW_TOP}
							width={BROWN_W}
							height={b ? 46 : 32}
							className={`basel-brown ${b ? "is-fixed" : "is-inferred"}`}
						/>
						<rect
							x={x + BROWN_W + GAP / 2}
							y={ROW_TOP}
							width={1.5}
							height={26}
							className="basel-blank"
						/>
						<rect
							x={x + BROWN_W + GAP + 2}
							y={ROW_TOP}
							width={WHITE_W}
							height={w ? 46 : 32}
							className={`basel-white ${w ? "is-fixed" : "is-inferred"}`}
						/>
						<text
							x={x + (BROWN_W + GAP + 2 + WHITE_W) / 2}
							y={ROW_TOP + 62}
							textAnchor="middle"
							className={`basel-unit ${any ? "is-fixed" : ""}`}
						>
							{k}
						</text>
						{any && (
							<text
								x={x + (BROWN_W + GAP + 2 + WHITE_W) / 2}
								y={ROW_TOP + 76}
								textAnchor="middle"
								className="basel-frag"
							>
								{label(k)}
							</text>
						)}
					</g>
				);
			})}

			<text x={LEFT} y={ROW_147 - 10} className="basel-strip-title">
				KH0147 · Berlin VA42510 · the white groups in forward order
			</text>
			<line
				x1={LEFT}
				y1={ROW_147}
				x2={width - LEFT}
				y2={ROW_147}
				className="basel-primary"
			/>
			{ks.map((k) => {
				const x = LEFT + (k - 1) * UNIT_W + 4;
				const w = fixed.white.has(k);
				return (
					<g key={k}>
						<rect
							x={x}
							y={ROW_147}
							width={UNIT_W - 8}
							height={14}
							className={`basel-white ${w ? "is-fixed" : "is-inferred"}`}
						/>
						<text
							x={x + (UNIT_W - 8) / 2}
							y={ROW_147 + 26}
							textAnchor="middle"
							className={`basel-unit ${w ? "is-fixed" : ""}`}
						>
							{k}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

/** Which fragment fixes each unit, as a compact legend under the strip. */
export function PlacementTable({ placements }: { placements: Placement[] }) {
	const half = (h: Placement["brown"]) => {
		if (!h) return <span className="muted">—</span>;
		return (
			<>
				<b>#{h.unit.k}</b> · {h.run.length} values {h.run.direction}
				{h.run.firm ? "" : " · probable"}
			</>
		);
	};
	return (
		<div className="ledger match-ledger basel-table">
			<table className="ledger-table">
				<thead>
					<tr>
						<th>Fragment</th>
						<th className="num">Cords</th>
						<th>Brown half → KH0450 unit</th>
						<th>White half → KH0147 unit</th>
						<th>Rule</th>
						<th>Reads as</th>
					</tr>
				</thead>
				<tbody>
					{placements.map((p) => (
						<tr
							key={p.id}
							className={
								p.ruleHolds === true
									? "match-exact"
									: p.brown || p.white
										? ""
										: "match-missing"
							}
						>
							<td>
								<strong>{p.id}</strong> <span className="muted">{p.alias}</span>
							</td>
							<td className="num">{p.cords}</td>
							<td>{half(p.brown)}</td>
							<td>
								{half(p.white)}
								{p.tail && (
									<>
										{" "}
										<span className="muted">
											· then {p.tail.value}, the last cord of unit #
											{p.tail.unit.k}
										</span>
									</>
								)}
							</td>
							<td className={p.ruleHolds === true ? "ok" : "muted"}>
								{p.ruleHolds === true
									? "holds"
									: p.ruleHolds === false
										? "fails"
										: "one side"}
							</td>
							<td className="muted">{p.orientation}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * Three bands at true size, one pendant pitch: KH0450 above, the placed
 * Basel fragments in the middle (each under the Berlin cords it repeats,
 * pinned to its KH0147 unit where it has one), KH0147 below. Brown threads
 * run up from a fragment to KH0450, white threads down to KH0147. Because
 * KH0450's units count from its end and KH0147's from its start, the brown
 * threads of a fragment reach the far side of the page while its white
 * threads drop straight down. Every thread is a value-verified strand.
 */
export function BaselBands({
	longId,
	tableId,
	fragments,
	strands,
	sils,
	colors,
}: {
	longId: string;
	tableId: string;
	fragments: readonly string[];
	strands: StrandFile | undefined;
	sils: Silhouettes;
	colors: ColorTable;
}) {
	const P = 4;
	const GUT = 8;
	const D = 26;
	const n = (id: string) => sils[id]?.l.length ?? 0;
	// threads oriented: fragment cord j ↔ Berlin cord i
	const pairs = (berlin: string, frag: string) => {
		const l = strands?.links[pairKey(berlin, frag)];
		if (!l) return [];
		const fa = l.a === frag;
		return l.threads
			.filter((t) => MATCH_KINDS.has(t.kind))
			.map((t) => ({
				j: (fa ? t.a : t.b)[0],
				i: (fa ? t.b : t.a)[0],
				v: fa ? t.va : t.vb,
			}));
	};
	const median = (xs: number[]) =>
		[...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
	const placed = fragments
		.map((id) => {
			const w = pairs(tableId, id);
			const b = pairs(longId, id);
			const ref = w.length ? w : b;
			if (!ref.length) return null;
			return {
				id,
				w,
				b,
				start: median(ref.map((t) => t.i - t.j)),
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.sort((p, q) => p.start - q.start);
	let right = -Infinity;
	for (const f of placed) {
		f.start = Math.max(f.start, right + 3);
		right = f.start + n(f.id);
	}
	const lo = Math.min(0, ...placed.map((f) => f.start));
	const hi = Math.max(n(longId), n(tableId), right);
	const X = (pos: number) => GUT + (pos - lo + 0.5) * P;
	const width = GUT * 2 + (hi - lo) * P;
	const maxL = Math.max(
		1,
		...[longId, tableId, ...placed.map((f) => f.id)].flatMap((id) =>
			(sils[id]?.l ?? []).map((x) => x ?? 0),
		),
	);
	const depth = (id: string, i: number) =>
		Math.max(2.5, ((sils[id]?.l[i] ?? 0) / maxL) * D);
	const yL = 22;
	const yF = 130;
	const yT = 238;
	const H = yT + D + 10;
	const c = (x: number) => Math.round(x * 100) / 100;
	const row = (id: string, start: number, y: number) => {
		const d = `M${c(X(start) - P / 2)},${y}H${c(X(start + n(id) - 1) + P / 2)}`;
		const cords: { d: string; color: string }[] = [];
		for (let i = 0; i < n(id); i++)
			cords.push({
				d: `M${c(X(start + i))},${y}V${c(y + depth(id, i))}`,
				color: hexFor(sils[id].c[i] ?? undefined, colors),
			});
		return (
			<g key={`${id}-row`}>
				<path className="bands-primary" d={d} />
				{cords.map((k, i) => (
					<path
						// biome-ignore lint/suspicious/noArrayIndexKey: cords are positional
						key={i}
						className="bands-cord"
						d={k.d}
						stroke={k.color}
					/>
				))}
			</g>
		);
	};
	const thread = (x0: number, y0: number, x1: number, y1: number) => {
		const m = (y0 + y1) / 2;
		return `M${c(x0)},${c(y0)}C${c(x0)},${c(m)} ${c(x1)},${c(m)} ${c(x1)},${c(y1)}`;
	};
	return (
		<div className="bands-scroll">
			<svg
				className="basel-bands"
				viewBox={`0 0 ${width} ${H}`}
				style={{ minWidth: `${Math.min(720, width)}px` }}
				role="img"
				aria-label={`${longId} above, the placed Basel fragments at true size in the middle, ${tableId} below; brown threads join fragments to ${longId}, white threads to ${tableId}`}
			>
				<text className="bands-label" x={GUT} y={12}>
					{longId} · Berlin VA42513 · {n(longId)} pendants · brown account
				</text>
				<text className="bands-label" x={GUT} y={yT + D + 8}>
					{tableId} · Berlin VA42510 · {n(tableId)} pendants · white account
				</text>
				{row(longId, 0, yL)}
				{row(tableId, 0, yT)}
				{placed.map((f) => (
					<g key={f.id}>
						{row(f.id, f.start, yF)}
						<text
							className="bands-frag"
							x={X(f.start + n(f.id) / 2 - 0.5)}
							y={yF - 5}
							textAnchor="middle"
						>
							{f.id.replace("KH0", "")}
						</text>
						{f.b.map((t) => (
							<path
								key={`b${t.j}`}
								className="bands-thread is-brown"
								d={thread(
									X(t.i),
									yL + depth(longId, t.i),
									X(f.start + t.j),
									yF,
								)}
							>
								<title>{`${f.id} pendant ${t.j + 1} = ${longId} pendant ${t.i + 1} = ${t.v}`}</title>
							</path>
						))}
						{f.w.map((t) => (
							<g key={`w${t.j}`}>
								<title>{`${f.id} pendant ${t.j + 1} = ${tableId} pendant ${t.i + 1} = ${t.v}`}</title>
								<path
									className="bands-thread-casing"
									d={thread(
										X(f.start + t.j),
										yF + depth(f.id, t.j),
										X(t.i),
										yT,
									)}
								/>
								<path
									className="bands-thread is-white"
									d={thread(
										X(f.start + t.j),
										yF + depth(f.id, t.j),
										X(t.i),
										yT,
									)}
								/>
							</g>
						))}
					</g>
				))}
			</svg>
		</div>
	);
}
